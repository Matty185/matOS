import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { siblingDiscountSchema } from "@matos/shared";

// PATCH /api/gym/sibling-discount — owner only (flow audit 8.3).
export const PATCH = withAuth(
  async (_request, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Personal workspaces don't have gym settings.");
    }
    const supabase = createClient();
    const { data: before } = await supabase
      .from("gyms")
      .select("sibling_discount_percent")
      .eq("id", context.gymId)
      .single();

    const { data: rows, error } = await supabase
      .from("gyms")
      .update({ sibling_discount_percent: input.sibling_discount_percent })
      .eq("id", context.gymId)
      .select("id");
    if (error || !rows || rows.length === 0) {
      console.error("[gym] sibling discount update failed", error);
      return apiError(500, "GYM_UPDATE_FAILED", "Something went wrong — the change wasn't saved.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "gym.sibling_discount_updated",
      entityType: "gyms",
      entityId: context.gymId,
      beforeState: before ?? null,
      afterState: { sibling_discount_percent: input.sibling_discount_percent },
      initiatedBy: "coach_manual",
    });

    return NextResponse.json({ success: true });
  },
  { requiredRole: "gym_owner", schema: siblingDiscountSchema },
);
