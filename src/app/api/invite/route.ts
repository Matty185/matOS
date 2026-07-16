import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { generateInviteToken, hashInviteToken, inviteExpiryDate } from "@/lib/auth/invite-token";
import { sendInviteEmail } from "@/lib/email/invite";
import { writeAuditLog } from "@/lib/audit/log";
import { createInviteSchema } from "@/lib/validation/invite";
import { NextResponse } from "next/server";

// POST /api/invite — coach/owner only. Generates (or regenerates — "resend
// invalidates old token" per plan §5) an invite for an existing member row.
// Member creation itself is a Stage 4 concern (/api/members); this route
// only ever invites a member_id that already exists in the caller's gym.
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();
    const serviceRole = createServiceRoleClient();

    // RLS (members_select_staff) naturally scopes this to the caller's own
    // gym — a member_id belonging to a different gym simply won't be found.
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, gym_id, first_name, email, user_id, active")
      .eq("id", input.member_id)
      .single();

    if (memberError || !member) {
      return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your gym.");
    }

    if (!member.active) {
      return apiError(409, "MEMBER_INACTIVE", "Cannot invite a deactivated member.");
    }

    if (member.user_id) {
      return apiError(
        409,
        "MEMBER_ALREADY_CLAIMED",
        "This member has already claimed their account.",
      );
    }

    const { data: gym, error: gymError } = await supabase
      .from("gyms")
      .select("name")
      .eq("id", member.gym_id)
      .single();

    if (gymError || !gym) {
      return apiError(500, "GYM_NOT_FOUND", "Something went wrong — the invite wasn't sent.");
    }

    // Invalidate any prior unclaimed invite for this member (resend
    // behaviour) rather than deleting it — matches "deletes are mostly
    // disabled," keeps the audit trail of prior invite attempts intact.
    await serviceRole
      .from("invites")
      .update({ expires_at: new Date().toISOString() })
      .eq("member_id", member.id)
      .is("claimed_at", null);

    const rawToken = generateInviteToken();
    const tokenHash = hashInviteToken(rawToken);

    const { data: invite, error: insertError } = await serviceRole
      .from("invites")
      .insert({
        member_id: member.id,
        gym_id: member.gym_id,
        token_hash: tokenHash,
        expires_at: inviteExpiryDate(),
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (insertError || !invite) {
      return apiError(
        500,
        "INVITE_CREATE_FAILED",
        "Something went wrong — the invite wasn't sent.",
      );
    }

    const claimUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${rawToken}`;

    try {
      await sendInviteEmail({
        to: member.email,
        memberFirstName: member.first_name,
        gymName: gym.name,
        claimUrl,
      });
    } catch (error) {
      console.error("[invite] failed to send invite email", error);
      return apiError(
        502,
        "EMAIL_SEND_FAILED",
        "The invite was created but the email couldn't be sent. Try resending.",
      );
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "invite.created",
      entityType: "invites",
      entityId: invite.id,
      afterState: { member_id: member.id, expires_at: inviteExpiryDate() },
      initiatedBy: "coach_manual",
    });

    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach", schema: createInviteSchema },
);
