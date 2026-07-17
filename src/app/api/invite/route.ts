import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createAndSendInvite } from "@/lib/auth/create-invite";
import { createInviteSchema } from "@/lib/validation/invite";
import { NextResponse } from "next/server";

// POST /api/invite — coach/owner only. Generates (or regenerates — "resend
// invalidates old token" per plan §5) an invite for an existing member row.
// Member creation itself is a Stage 4 concern (/api/members, which
// auto-invites via the same createAndSendInvite helper); this route only
// ever invites a member_id that already exists in the caller's gym.
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();

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

    const result = await createAndSendInvite({
      memberId: member.id,
      memberGymId: member.gym_id,
      memberFirstName: member.first_name,
      memberEmail: member.email,
      gymName: gym.name,
      actorUserId: context.userId,
    });

    if (!result.ok) {
      return apiError(result.status, result.code, result.message);
    }

    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach", schema: createInviteSchema },
);
