import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { promoteMember } from "@/lib/promotions/promote";
import { promoteBeltSchema } from "@matos/shared";

// POST /api/members/[id]/promote — coach/owner only. Updates the member's
// current belt/stripes AND inserts a belt_history row, per plan §7 ("select
// belt/stripes, notes, confirm -> updates member + history + audit"). The
// work is in promoteMember (shared with grading day, flow audit 5.4).
export const POST = withAuth(
  async (_request: NextRequest, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No member id provided.");

    const result = await promoteMember(
      createClient(),
      { gymId: context.gymId, userId: context.userId },
      id,
      { belt: input.belt, stripes: input.stripes, notes: input.notes },
      {
        initiatedBy: input.agent_query ? "agent" : "coach_manual",
        agentQuery: input.agent_query ?? null,
      },
    );
    if (!result.ok) {
      if (result.code === "MEMBER_NOT_FOUND") {
        return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your academy.");
      }
      if (result.code === "MEMBER_INACTIVE") {
        return apiError(409, "MEMBER_INACTIVE", "Reactivate this member before promoting them.");
      }
      if (result.code === "NO_CHANGE") {
        return apiError(409, "NO_CHANGE", "They already hold that rank.");
      }
      if (result.code === "NOT_A_TRAINING_MEMBER") {
        return apiError(400, "NOT_A_TRAINING_MEMBER", "Parent accounts don't have a belt.");
      }
      return apiError(500, "PROMOTE_FAILED", "Something went wrong — the promotion wasn't saved.");
    }
    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach", schema: promoteBeltSchema },
);
