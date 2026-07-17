import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { generateInviteToken, hashInviteToken, inviteExpiryDate } from "@/lib/auth/invite-token";
import { sendInviteEmail } from "@/lib/email/invite";
import { writeAuditLog } from "@/lib/audit/log";

type CreateAndSendInviteParams = {
  memberId: string;
  memberGymId: string;
  memberFirstName: string;
  memberEmail: string;
  gymName: string;
  actorUserId: string;
};

type CreateAndSendInviteResult =
  { ok: true } | { ok: false; status: number; code: string; message: string };

/**
 * Shared by POST /api/invite (explicit invite/resend) and POST /api/members
 * (auto-invite on add, per plan §7 "on add, invite email sent
 * automatically") — the two call sites shouldn't duplicate token
 * generation, the resend-invalidates-old-token behaviour, or the audit
 * write. Callers own the member-lookup/validation steps before calling
 * this (already-claimed checks, etc.) since those differ slightly between
 * "invite an existing member" and "just created this member."
 */
export async function createAndSendInvite(
  params: CreateAndSendInviteParams,
): Promise<CreateAndSendInviteResult> {
  const serviceRole = createServiceRoleClient();

  // Invalidate any prior unclaimed invite for this member (resend
  // behaviour) rather than deleting it — matches "deletes are mostly
  // disabled," keeps the audit trail of prior invite attempts intact.
  await serviceRole
    .from("invites")
    .update({ expires_at: new Date().toISOString() })
    .eq("member_id", params.memberId)
    .is("claimed_at", null);

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);

  const { data: invite, error: insertError } = await serviceRole
    .from("invites")
    .insert({
      member_id: params.memberId,
      gym_id: params.memberGymId,
      token_hash: tokenHash,
      expires_at: inviteExpiryDate(),
      created_by: params.actorUserId,
    })
    .select("id")
    .single();

  if (insertError || !invite) {
    return {
      ok: false,
      status: 500,
      code: "INVITE_CREATE_FAILED",
      message: "Something went wrong — the invite wasn't sent.",
    };
  }

  const claimUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${rawToken}`;

  try {
    await sendInviteEmail({
      to: params.memberEmail,
      memberFirstName: params.memberFirstName,
      gymName: params.gymName,
      claimUrl,
    });
  } catch (error) {
    console.error("[invite] failed to send invite email", error);
    return {
      ok: false,
      status: 502,
      code: "EMAIL_SEND_FAILED",
      message: "The invite was created but the email couldn't be sent. Try resending.",
    };
  }

  await writeAuditLog({
    gymId: params.memberGymId,
    actorId: params.actorUserId,
    action: "invite.created",
    entityType: "invites",
    entityId: invite.id,
    afterState: { member_id: params.memberId, expires_at: inviteExpiryDate() },
    initiatedBy: "coach_manual",
  });

  return { ok: true };
}
