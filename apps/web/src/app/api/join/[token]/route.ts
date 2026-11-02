import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { findUserByEmail } from "@/lib/auth/find-user-by-email";
import { writeAuditLog } from "@/lib/audit/log";
import { GDPR_CONSENT_VERSION, joinGymSchema, type Database } from "@matos/shared";

// Stage O7: public (unauthenticated) self-serve sign-up via a coach's
// one-time link. The hashed-token match is the only authorization; the
// person fills in their own details and joins as an athlete — never staff.
//
// More attempts than a per-person invite (5): this form has many more
// fields to get wrong. Every request against a valid token counts.
const MAX_JOIN_ATTEMPTS = 10;

type LinkRow = {
  id: string;
  gym_id: string;
  used_at: string | null;
  expires_at: string;
  attempt_count: number;
  gyms: { name: string; kind: string; active: boolean } | null;
};

const ASK = "Ask your coach for a new one.";

function unavailable(link: LinkRow | null): Response | null {
  if (!link) return apiError(404, "LINK_NOT_FOUND", "This sign-up link isn't valid.");
  if (link.used_at) {
    return apiError(410, "LINK_USED", `This sign-up link has already been used. ${ASK}`);
  }
  if (link.attempt_count >= MAX_JOIN_ATTEMPTS) {
    return apiError(410, "LINK_LOCKED", `This sign-up link has been locked. ${ASK}`);
  }
  if (
    new Date(link.expires_at) <= new Date() ||
    !link.gyms ||
    link.gyms.kind !== "gym" ||
    !link.gyms.active
  ) {
    return apiError(410, "LINK_EXPIRED", `This sign-up link has expired. ${ASK}`);
  }
  return null;
}

async function findLink(token: string): Promise<LinkRow | null> {
  const { data } = await createServiceRoleClient()
    .from("signup_links")
    .select("id, gym_id, used_at, expires_at, attempt_count, gyms(name, kind, active)")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();
  return (data as LinkRow | null) ?? null;
}

function emailInGym() {
  return apiError(
    409,
    "EMAIL_IN_GYM",
    "Someone with this email is already on the gym's list. Ask your coach for your personal invite link instead.",
  );
}

// GET — just enough to render the form: the gym's name.
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  const link = await findLink(params.token);
  const blocked = unavailable(link);
  if (blocked || !link) return blocked!;
  return NextResponse.json({ gymName: link.gyms?.name ?? null });
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceRoleClient();
  const link = await findLink(params.token);
  const blocked = unavailable(link);
  if (blocked || !link) return blocked!;

  const { data: attempts, error: attemptError } = await supabase.rpc(
    "increment_signup_link_attempt",
    { p_link_id: link.id },
  );
  if (attemptError || attempts === null) {
    console.error("[join] failed to increment attempt_count", attemptError);
    return apiError(500, "INTERNAL_ERROR", "Something went wrong — please try again.");
  }
  if (attempts > MAX_JOIN_ATTEMPTS) {
    return apiError(410, "LINK_LOCKED", `This sign-up link has been locked. ${ASK}`);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_BODY", "Request body must be valid JSON.");
  }
  const parsed = joinGymSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Some details are missing or invalid.");
  }
  const input = parsed.data;

  // Cheap pre-check so we don't create an auth user just to throw it away.
  // redeem_signup_link re-checks inside its own transaction.
  const { data: onRoster } = await supabase
    .from("members")
    .select("id")
    .eq("gym_id", link.gym_id)
    .ilike("email", input.email.replace(/[\\%_]/g, "\\$&"))
    .limit(1)
    .maybeSingle();
  if (onRoster) return emailInGym();

  // Branch decided from our own lookup; the client's flag only has to agree.
  const existingUser = await findUserByEmail(supabase, input.email);
  if (existingUser && !input.existing_account) {
    return apiError(
      409,
      "ACCOUNT_EXISTS",
      "This email already has a MatOS account. Enter that account's password to join with it.",
    );
  }
  if (!existingUser && input.existing_account) {
    return apiError(
      400,
      "NO_ACCOUNT",
      "There's no MatOS account with this email yet — choose a new password instead.",
    );
  }

  let userId: string;
  let createdUser = false;
  if (existingUser) {
    // Proof of ownership: a real sign-in against the existing password
    // (same as the invite attach flow). An email match alone would let
    // anyone holding a sign-up link attach someone else's account.
    const verifyClient = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error: verifyError } = await verifyClient.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (verifyError) {
      // A wrong password costs three attempts, not one: a link must not
      // become a cheap way to guess passwords on someone else's account.
      await supabase.rpc("increment_signup_link_attempt", { p_link_id: link.id });
      await supabase.rpc("increment_signup_link_attempt", { p_link_id: link.id });
      return apiError(401, "INCORRECT_PASSWORD", "Incorrect password for the existing account.");
    }
    userId = existingUser.id;
  } else {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      console.error("[join] failed to create auth user", createError);
      return apiError(
        409,
        "ACCOUNT_CREATE_FAILED",
        "Couldn't set up your account. Ask your coach.",
      );
    }
    userId = created.user.id;
    createdUser = true;
  }

  // Member + starting rank + consent + link marked used, in one transaction.
  const { data: memberId, error: redeemError } = await supabase.rpc("redeem_signup_link", {
    p_link_id: link.id,
    p_user_id: userId,
    p_consent_version: GDPR_CONSENT_VERSION,
    p_details: {
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      phone: input.phone ?? "",
      emergency_contact_name: input.emergency_contact_name ?? "",
      emergency_contact_phone: input.emergency_contact_phone ?? "",
      belt: input.belt,
      stripes: input.stripes,
    },
  });

  if (redeemError || !memberId) {
    // Only roll back the new login when the database definitely refused
    // (a Postgres SQLSTATE). A transport error could mean the redeem
    // committed and only the reply was lost — deleting the user then would
    // lock the person out of the member row they just created.
    const definitelyFailed = !!redeemError?.code && /^[0-9A-Z]{5}$/.test(redeemError.code);
    if (createdUser && definitelyFailed) {
      const { error: cleanupError } = await supabase.auth.admin.deleteUser(userId);
      if (cleanupError) console.error("[join] rollback: failed to delete auth user", cleanupError);
    }
    // A unique violation means another sign-up (or a coach adding the same
    // person) won a race past the pre-checks — map it like the pre-checks.
    const hint =
      redeemError?.code === "23505"
        ? redeemError.message.includes("members_gym_user_unique")
          ? "ALREADY_MEMBER"
          : "EMAIL_IN_GYM"
        : redeemError?.hint;
    switch (hint) {
      case "EMAIL_IN_GYM":
        return emailInGym();
      case "ALREADY_MEMBER":
        return apiError(
          409,
          "ALREADY_MEMBER",
          "You're already a member of this gym — just sign in.",
        );
      case "LINK_UNAVAILABLE":
        return apiError(410, "LINK_USED", `This sign-up link has already been used. ${ASK}`);
      default:
        console.error("[join] redeem failed", redeemError);
        return apiError(500, "JOIN_FAILED", "Something went wrong — you haven't been signed up.");
    }
  }

  await writeAuditLog({
    gymId: link.gym_id,
    actorId: userId,
    action: "member.self_registered",
    entityType: "members",
    entityId: memberId,
    afterState: { signup_link_id: link.id, belt: input.belt, stripes: input.stripes },
    initiatedBy: "self_service",
  });

  return NextResponse.json({ success: true, email: input.email }, { status: 201 });
}
