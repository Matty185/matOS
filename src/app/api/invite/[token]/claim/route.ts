import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hashInviteToken, MAX_INVITE_ATTEMPTS } from "@/lib/auth/invite-token";
import { writeAuditLog } from "@/lib/audit/log";
import { claimInviteSchema, GDPR_CONSENT_VERSION } from "@/lib/validation/invite";

// POST /api/invite/[token]/claim — public, unauthenticated. Sets a password,
// creates/links the auth.users row, captures GDPR consent (this app has no
// separate "registration" step — claiming an invite IS registration), and
// marks the invite claimed. Every request against a matched token counts
// toward the 5-attempt limit (plan §5), regardless of why it ultimately
// succeeds or fails, since the limit exists to bound total interaction with
// a given token, not just validation failures.
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const tokenHash = hashInviteToken(params.token);
  const supabase = createServiceRoleClient();

  const { data: invite, error: inviteError } = await supabase
    .from("invites")
    .select("id, member_id, gym_id, claimed_at, expires_at, attempt_count")
    .eq("token_hash", tokenHash)
    .single();

  if (inviteError || !invite) {
    return apiError(404, "INVITE_NOT_FOUND", "This invite link isn't valid.");
  }

  if (invite.claimed_at) {
    return apiError(410, "INVITE_ALREADY_CLAIMED", "This invite has already been used.");
  }

  if (invite.attempt_count >= MAX_INVITE_ATTEMPTS) {
    return apiError(
      410,
      "INVITE_LOCKED",
      "This invite has been locked. Ask your coach to resend it.",
    );
  }

  if (new Date(invite.expires_at) < new Date()) {
    return apiError(410, "INVITE_EXPIRED", "This invite has expired. Ask your coach to resend it.");
  }

  // Atomic increment (RPC, `attempt_count = attempt_count + 1 returning`) —
  // a plain read-then-write here would be a check-then-act race under
  // concurrent requests against the same token (each reading the same stale
  // count). Counts this attempt before validating/processing the body, so a
  // malformed or adversarial request still consumes one of the 5 attempts.
  // The *returned* count is authoritative for the lockout decision below,
  // never the pre-fetched `invite.attempt_count`.
  const { data: newAttemptCount, error: attemptError } = await supabase.rpc(
    "increment_invite_attempt",
    {
      invite_id: invite.id,
    },
  );

  if (attemptError || newAttemptCount === null) {
    console.error("[invite claim] failed to increment attempt_count", attemptError);
    return apiError(500, "INTERNAL_ERROR", "Something went wrong — the change wasn't saved.");
  }

  if (newAttemptCount > MAX_INVITE_ATTEMPTS) {
    return apiError(
      410,
      "INVITE_LOCKED",
      "This invite has been locked. Ask your coach to resend it.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_BODY", "Request body must be valid JSON.");
  }

  const parsed = claimInviteSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid request data.");
  }

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, gym_id, email, user_id")
    .eq("id", invite.member_id)
    .single();

  if (memberError || !member) {
    return apiError(500, "MEMBER_NOT_FOUND", "Something went wrong — the invite wasn't claimed.");
  }

  if (member.user_id) {
    return apiError(409, "MEMBER_ALREADY_CLAIMED", "This account has already been claimed.");
  }

  const { data: created, error: createUserError } = await supabase.auth.admin.createUser({
    email: member.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (createUserError || !created.user) {
    console.error("[invite claim] failed to create auth user", createUserError);
    return apiError(
      409,
      "ACCOUNT_CREATE_FAILED",
      "Couldn't set up your account. Contact your coach.",
    );
  }

  const newUserId = created.user.id;

  const { error: linkError } = await supabase
    .from("members")
    .update({ user_id: newUserId })
    .eq("id", member.id);

  if (linkError) {
    console.error("[invite claim] failed to link member to auth user", linkError);
    await supabase.auth.admin.deleteUser(newUserId);
    return apiError(500, "MEMBER_LINK_FAILED", "Something went wrong — the invite wasn't claimed.");
  }

  // Checked, unlike the original version of this route: an unnoticed
  // failure here would leave a fully claimed, logged-in-capable account
  // with no consent record on file — a silent GDPR gap with no retry path,
  // since the invite would still get marked claimed below. On failure, roll
  // back the account creation entirely so the coach's resend / the same
  // token (still within its attempt budget) can retry cleanly.
  const { error: consentError } = await supabase.from("gdpr_consents").insert({
    member_id: member.id,
    gym_id: member.gym_id,
    data_storage_consent: true,
    consented_at: new Date().toISOString(),
    consent_version: GDPR_CONSENT_VERSION,
  });

  if (consentError) {
    console.error("[invite claim] failed to record gdpr consent", consentError);
    await supabase.auth.admin.deleteUser(newUserId);
    return apiError(
      500,
      "CONSENT_RECORD_FAILED",
      "Something went wrong — the invite wasn't claimed.",
    );
  }

  const { error: claimedError } = await supabase
    .from("invites")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", invite.id);

  if (claimedError) {
    console.error("[invite claim] failed to mark invite claimed", claimedError);
    // Account + consent already committed at this point — don't roll those
    // back over a bookkeeping failure on the invite row itself; log loudly
    // for manual follow-up instead. The member is linked and can log in
    // regardless of this row's claimed_at state.
  }

  await writeAuditLog({
    gymId: member.gym_id,
    actorId: newUserId,
    action: "invite.claimed",
    entityType: "members",
    entityId: member.id,
    initiatedBy: "self_service",
  });

  return NextResponse.json({ success: true, email: member.email });
}
