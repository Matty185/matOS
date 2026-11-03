import { withAuth } from "@/lib/auth/withAuth";
import { isStaffRole } from "@/lib/auth/roles";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createInvite } from "@/lib/auth/create-invite";
import { isInviteEmailEnabled } from "@/lib/email/invite";
import { createInviteSchema } from "@matos/shared";
import { NextResponse } from "next/server";

// POST /api/invite — coach/owner only. Generates (or regenerates — "resend
// invalidates old token" per plan §5) an invite for an existing member row.
// Stage O2: `delivery: "link"` (default) returns the claim URL for the coach
// to share directly; "email" is only accepted when INVITE_EMAIL_ENABLED.
// Member creation itself is a Stage 4 concern (/api/members, which
// auto-invites via the same createInvite helper); this route only
// ever invites a member_id that already exists in the caller's gym.
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();

    // RLS (members_select_staff) naturally scopes this to the caller's own
    // gym — a member_id belonging to a different gym simply won't be found.
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, gym_id, first_name, email, user_id, active, role")
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

    // Staff invites are owner-only (team management, plan §4) — the DB
    // already blocks a coach *creating* a staff row; this stops a coach
    // minting a claim link for an existing coach/owner row and claiming it.
    if (isStaffRole(member.role) && context.role !== "gym_owner") {
      return apiError(403, "FORBIDDEN", "Only the gym owner can invite coaches.");
    }

    if (input.delivery === "email" && !isInviteEmailEnabled()) {
      return apiError(
        409,
        "EMAIL_DISABLED",
        "Email invites aren't set up yet — share the invite link instead.",
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

    if (!member.email) {
      return apiError(
        409,
        "MEMBER_NO_EMAIL",
        "This member has no email, so they can't have a login. Add their email first.",
      );
    }

    const result = await createInvite({
      memberId: member.id,
      memberGymId: member.gym_id,
      memberFirstName: member.first_name,
      memberEmail: member.email,
      gymName: gym.name,
      actorUserId: context.userId,
      delivery: input.delivery,
    });

    if (!result.ok) {
      return apiError(result.status, result.code, result.message);
    }

    return NextResponse.json(
      result.delivery === "link"
        ? {
            success: true,
            delivery: "link",
            claimUrl: result.claimUrl,
            expiresAt: result.expiresAt,
            gymName: gym.name,
          }
        : { success: true, delivery: "email" },
      // The claim URL is a credential — never cache this response.
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
  { requiredRole: "coach", schema: createInviteSchema },
);
