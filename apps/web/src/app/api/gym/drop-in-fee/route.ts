import { NextResponse } from "next/server";
import { dropInFeeSchema } from "@matos/shared";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";

// PATCH /api/gym/drop-in-fee — owner only (flow audit 4.6): the usual mat
// fee, pre-filled when a coach records a visitor. Blank clears it.
export const PATCH = withAuth(
  async (_request, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Personal workspaces don't have academy settings.");
    }
    const supabase = createClient();
    const { data: before } = await supabase
      .from("gyms")
      .select("drop_in_fee")
      .eq("id", context.gymId)
      .single();
    const { data: rows, error } = await supabase
      .from("gyms")
      .update({ drop_in_fee: input.drop_in_fee })
      .eq("id", context.gymId)
      .select("id");
    if (error || !rows || rows.length === 0) {
      console.error("[gym] drop-in fee update failed", error);
      return apiError(500, "GYM_UPDATE_FAILED", "Something went wrong — the change wasn't saved.");
    }
    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "gym.drop_in_fee_updated",
      entityType: "gyms",
      entityId: context.gymId,
      beforeState: before ?? null,
      afterState: { drop_in_fee: input.drop_in_fee },
      initiatedBy: "coach_manual",
    });
    return NextResponse.json({ success: true });
  },
  { requiredRole: "gym_owner", schema: dropInFeeSchema },
);
