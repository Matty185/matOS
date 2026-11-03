import { NextResponse, type NextRequest } from "next/server";
import { isStaffRole } from "@/lib/auth/roles";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hashInviteToken, MAX_INVITE_ATTEMPTS } from "@/lib/auth/invite-token";
import { findUserByEmail } from "@/lib/auth/find-user-by-email";
import { writeAuditLog } from "@/lib/audit/log";
import {
  claimInviteSchema,
  attachInviteSchema,
  GDPR_CONSENT_VERSION,
  type Database,
} from "@matos/shared";

// POST /api/invite/[token]/claim — public, unauthenticated. Two branches,
// decided fresh server-side (never trusting a client-supplied flag) by
// whether the invited email already has an auth.users account:
//
// - No existing account (the original, still-default flow): sets a
//   password, creates the auth.users row, captures GDPR consent (this app
//   has no separate "registration" step — claiming an invite IS
//   registration).
// - Existing account (Stage S2 "attach flow", matos_mobile_plan.md §2.3 —
//   most commonly a solo signup accepting a gym's invite): verifies the
//   *existing* password rather than setting a new one, then links that
//   same auth user into this member row. The personal workspace persists
//   alongside — nothing about it is touched here.
//
// Either way, linking `members.user_id` fires the Stage S1
// `members_sync_memberships` trigger, which sets `is_current = true` on
// the newly-linked membership. For the attach branch specifically, this
// means accepting a gym invite switches an existing multi-workspace user's
// active context to the gym they just joined — a deliberate choice (not
// the trigger's own concern to decide, per its header comment): matches
// the common "you just joined, you probably want to see it" expectation,
// and is the scenario the S1 migration's design notes explicitly left for
// "whichever stage first makes it reachable" to decide.
//
// Every request against a matched token counts toward the 5-attempt limit
// (plan §5), regardless of why it ultimately succeeds or fails, since the
// limit exists to bound total interaction with a given token, not just
// validation failures.
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const tokenHash = hashInviteToken(params.token);
  const supabase = createServiceRoleClient();

  const { data: invite, error: inviteError } = await supabase
    .from("invites")
    .select("id, member_id, gym_id, claimed_at, expires_at, attempt_count, created_by")
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

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, gym_id, email, user_id, role")
    .eq("id", invite.member_id)
    .single();

  if (memberError || !member) {
    return apiError(500, "MEMBER_NOT_FOUND", "Something went wrong — the invite wasn't claimed.");
  }

  if (member.user_id) {
    return apiError(409, "MEMBER_ALREADY_CLAIMED", "This account has already been claimed.");
  }

  // Email-less (roster-only) members can't hold a login; no invite should
  // exist for one, but never create an account without an email.
  const memberEmail = member.email;
  if (!memberEmail) {
    return apiError(
      409,
      "MEMBER_NO_EMAIL",
      "This invite can't be used. Ask your coach for a new one.",
    );
  }

  // Stage O4/O5 (defence in depth): a coach/owner login may only be claimed
  // from a link minted by an owner of that gym (or the operator's
  // provisioning script, created_by null). The role route already expires
  // older links on promotion; this catches any path that misses it.
  if (isStaffRole(member.role) && invite.created_by) {
    const { data: issuer } = await supabase
      .from("members")
      .select("id")
      .eq("user_id", invite.created_by)
      .eq("gym_id", member.gym_id)
      .eq("role", "gym_owner")
      .eq("active", true)
      .maybeSingle();
    if (!issuer) {
      return apiError(
        403,
        "INVITE_NOT_VALID_FOR_ROLE",
        "This link can't be used for a coach account. Ask the gym owner for a new one.",
      );
    }
  }

  // Determined fresh here, not trusted from the client — an attacker
  // controlling the request body can't force either branch; which schema
  // validates the body and which auth operation runs both follow this
  // lookup alone.
  const existingUser = await findUserByEmail(supabase, memberEmail);

  let newUserId: string;
  let previousCurrentGymId: string | null = null;

  // Undoes exactly what the trigger did on a successful link, for the
  // attach branch only (a newly-created account has no prior state to
  // restore — deleting it outright, as the two call sites below already
  // do, is sufficient there). Errors are logged, not swallowed: a
  // security-reviewer finding — if either write here fails silently, an
  // otherwise-unaffected multi-workspace user could be left with zero
  // is_current=true rows, breaking my_gym_id()/current_member() for their
  // entire session over what was originally just a bookkeeping failure on
  // the gym they were only attaching to.
  async function rollbackAttachLink(userId: string, linkedGymId: string) {
    const { error: deleteError } = await supabase
      .from("memberships")
      .delete()
      .eq("user_id", userId)
      .eq("gym_id", linkedGymId);
    if (deleteError) {
      console.error("[invite claim] rollback: failed to delete new membership", deleteError);
    }
    if (previousCurrentGymId && previousCurrentGymId !== linkedGymId) {
      const { error: restoreError } = await supabase
        .from("memberships")
        .update({ is_current: true })
        .eq("user_id", userId)
        .eq("gym_id", previousCurrentGymId);
      if (restoreError) {
        console.error(
          "[invite claim] rollback: failed to restore previous membership",
          restoreError,
        );
      }
    }
  }

  if (existingUser) {
    const parsed = attachInviteSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "VALIDATION_ERROR", "Invalid request data.");
    }

    // Verifies the *existing* password by actually attempting a sign-in
    // against it, via a throwaway anon-key client (not the service-role
    // client, which has no password to check against — and not the
    // request's own cookie-bound client, since there is no session yet).
    // This is the only proof-of-ownership check in the attach branch: a
    // bare email match alone would let anyone claim an invite sent to any
    // email that happens to already have a MatOS account, without proving
    // they control it.
    const verifyClient = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error: verifyError } = await verifyClient.auth.signInWithPassword({
      email: memberEmail,
      password: parsed.data.password,
    });

    if (verifyError) {
      return apiError(401, "INCORRECT_PASSWORD", "Incorrect password for the existing account.");
    }

    newUserId = existingUser.id;

    // Snapshotted before linking, so a later failure can be rolled back
    // precisely: the members_sync_memberships trigger (Stage S1) that
    // fires on the link below unconditionally sets is_current=true on the
    // new membership and false on whichever one was current before — it
    // has no concept of "this attach ultimately failed, undo it," and its
    // own header comment explicitly documents that it never cleans up a
    // membership row on unlink (members.user_id -> null doesn't fire its
    // insert-oriented body). Without this snapshot, a failure after a
    // successful link (e.g. the gdpr_consents insert below) would leave
    // this existing user's active gym silently pointed at a gym they have
    // no member row in, with no way to tell what it should revert to.
    const { data: previousCurrent } = await supabase
      .from("memberships")
      .select("gym_id")
      .eq("user_id", existingUser.id)
      .eq("is_current", true)
      .maybeSingle();
    previousCurrentGymId = previousCurrent?.gym_id ?? null;
  } else {
    const parsed = claimInviteSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "VALIDATION_ERROR", "Invalid request data.");
    }

    const { data: created, error: createUserError } = await supabase.auth.admin.createUser({
      email: memberEmail,
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

    newUserId = created.user.id;
  }

  const { error: linkError } = await supabase
    .from("members")
    .update({ user_id: newUserId })
    .eq("id", member.id);

  if (linkError) {
    console.error("[invite claim] failed to link member to auth user", linkError);
    if (!existingUser) await supabase.auth.admin.deleteUser(newUserId);
    return apiError(500, "MEMBER_LINK_FAILED", "Something went wrong — the invite wasn't claimed.");
  }

  // Checked, unlike the original version of this route: an unnoticed
  // failure here would leave a fully claimed, logged-in-capable account
  // with no consent record on file — a silent GDPR gap with no retry path,
  // since the invite would still get marked claimed below. On failure, roll
  // back so the coach's resend / the same token (still within its attempt
  // budget) can retry cleanly — but *what* rolls back differs by branch:
  // a newly-created account is deleted outright (nothing else depends on
  // it yet), while an attach-flow account is a real, pre-existing user —
  // deleting it would destroy their unrelated personal workspace over a
  // bookkeeping failure on *this* gym's consent row. For that branch, only
  // the just-created link is undone, leaving their existing account
  // exactly as it was before this request.
  const { error: consentError } = await supabase.from("gdpr_consents").insert({
    member_id: member.id,
    gym_id: member.gym_id,
    data_storage_consent: true,
    consented_at: new Date().toISOString(),
    consent_version: GDPR_CONSENT_VERSION,
  });

  if (consentError) {
    console.error("[invite claim] failed to record gdpr consent", consentError);
    if (existingUser) {
      await supabase.from("members").update({ user_id: null }).eq("id", member.id);
      await rollbackAttachLink(existingUser.id, member.gym_id);
    } else {
      await supabase.auth.admin.deleteUser(newUserId);
    }
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

  return NextResponse.json({ success: true, email: memberEmail });
}
