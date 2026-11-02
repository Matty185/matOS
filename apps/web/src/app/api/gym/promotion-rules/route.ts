import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { promotionRulesSchema } from "@matos/shared";

// PATCH /api/gym/promotion-rules — owner only. Flow audit 5.3: the gym's
// guidance for "ready for the next stripe". Always the caller's gym;
// gyms_update_owner RLS and the column checks are the real boundary.
export const PATCH = withAuth(
  async (_request, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Personal workspaces don't have gym settings.");
    }

    const supabase = createClient();
    const { data: before } = await supabase
      .from("gyms")
      .select("promotion_classes_per_stripe, promotion_months_per_stripe")
      .eq("id", context.gymId)
      .single();

    const after = {
      promotion_classes_per_stripe: input.promotion_classes_per_stripe,
      promotion_months_per_stripe: input.promotion_months_per_stripe,
    };
    const { data: updated, error } = await supabase
      .from("gyms")
      .update(after)
      .eq("id", context.gymId)
      .select("id");

    if (error || !updated || updated.length === 0) {
      console.error("[gym] promotion rules update failed", error);
      return apiError(500, "GYM_UPDATE_FAILED", "Something went wrong — the change wasn't saved.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "gym.promotion_rules_updated",
      entityType: "gyms",
      entityId: context.gymId,
      beforeState: before ?? null,
      afterState: after,
      initiatedBy: "coach_manual",
    });

    return NextResponse.json({ success: true });
  },
  { requiredRole: "gym_owner", schema: promotionRulesSchema },
);
