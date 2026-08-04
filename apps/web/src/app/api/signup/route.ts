import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLog } from "@/lib/audit/log";
import { signupSchema, GDPR_CONSENT_VERSION } from "@matos/shared";

// POST /api/signup — public, unauthenticated. Stage S2's account-primary
// entry point: creates an auth user, a personal-workspace `gyms` row
// (kind='personal'), a `members` row linking the two (which fires the
// Stage S1 `members_sync_memberships` trigger, auto-creating the
// `memberships` row), and a GDPR consent record — mirroring
// invite/[token]/claim/route.ts's service-role, no-session-yet pattern,
// since RLS has no INSERT policy on `gyms` at all and `members_insert_staff`
// requires the caller to already be coach/owner *in that gym*, which a
// brand-new user isn't yet (see the S1 migration's own RLS section).
export async function POST(request: NextRequest) {
  const supabase = createServiceRoleClient();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_BODY", "Request body must be valid JSON.");
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid request data.");
  }

  const { firstName, lastName, email, password } = parsed.data;

  const { data: created, error: createUserError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createUserError || !created.user) {
    const message = createUserError?.message?.toLowerCase() ?? "";
    if (
      message.includes("already") ||
      message.includes("registered") ||
      message.includes("exists")
    ) {
      return apiError(
        409,
        "EMAIL_ALREADY_REGISTERED",
        "An account with this email already exists. Sign in instead.",
      );
    }
    console.error("[signup] failed to create auth user", createUserError);
    return apiError(500, "ACCOUNT_CREATE_FAILED", "Couldn't set up your account.");
  }

  const newUserId = created.user.id;

  // Rollback tracker — unwound in reverse dependency order if any later
  // step fails, so a partial signup never leaves an orphaned auth user
  // with no workspace, or a workspace with no consent record on file.
  // Deletes memberships before gyms (memberships.gym_id also references
  // gyms(id) on delete restrict, same as members.gym_id) — a database-
  // reviewer finding: the members_sync_memberships trigger (Stage S1)
  // creates a memberships row the instant the members insert below
  // succeeds, and the original version of this rollback only accounted
  // for the members->gyms FK, not memberships->gyms, so the gyms delete
  // would fail silently (errors were unchecked) on the one path that
  // actually reaches it — leaving an orphaned, ownerless "personal
  // workspace" gym row behind even though auth.admin.deleteUser() still
  // ran and correctly removed the account itself.
  let createdGymId: string | null = null;
  let createdMemberId: string | null = null;

  async function rollback() {
    if (createdMemberId) {
      const { error } = await supabase.from("members").delete().eq("id", createdMemberId);
      if (error) console.error("[signup] rollback: failed to delete member", error);
    }
    if (createdGymId) {
      const { error: membershipsError } = await supabase
        .from("memberships")
        .delete()
        .eq("user_id", newUserId);
      if (membershipsError) {
        console.error("[signup] rollback: failed to delete memberships", membershipsError);
      }
      const { error: gymError } = await supabase.from("gyms").delete().eq("id", createdGymId);
      if (gymError) console.error("[signup] rollback: failed to delete gym", gymError);
    }
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(newUserId);
    if (deleteUserError)
      console.error("[signup] rollback: failed to delete auth user", deleteUserError);
  }

  const { data: gym, error: gymError } = await supabase
    .from("gyms")
    .insert({
      name: `${firstName} ${lastName}'s Workspace`,
      kind: "personal",
      contact_email: email,
    })
    .select("id")
    .single();

  if (gymError || !gym) {
    console.error("[signup] failed to create personal workspace", gymError);
    await rollback();
    return apiError(500, "WORKSPACE_CREATE_FAILED", "Couldn't set up your account.");
  }
  createdGymId = gym.id;

  const { data: member, error: memberError } = await supabase
    .from("members")
    .insert({
      gym_id: gym.id,
      user_id: newUserId,
      role: "gym_owner",
      first_name: firstName,
      last_name: lastName,
      email,
      join_date: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();

  if (memberError || !member) {
    console.error("[signup] failed to create member row", memberError);
    await rollback();
    return apiError(500, "WORKSPACE_CREATE_FAILED", "Couldn't set up your account.");
  }
  createdMemberId = member.id;

  const { error: consentError } = await supabase.from("gdpr_consents").insert({
    member_id: member.id,
    gym_id: gym.id,
    data_storage_consent: true,
    consented_at: new Date().toISOString(),
    consent_version: GDPR_CONSENT_VERSION,
  });

  if (consentError) {
    console.error("[signup] failed to record gdpr consent", consentError);
    await rollback();
    return apiError(500, "CONSENT_RECORD_FAILED", "Couldn't set up your account.");
  }

  await writeAuditLog({
    gymId: gym.id,
    actorId: newUserId,
    action: "account.signup",
    entityType: "members",
    entityId: member.id,
    initiatedBy: "self_service",
  });

  return NextResponse.json({ success: true, email });
}
