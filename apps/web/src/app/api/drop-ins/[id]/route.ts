import { NextResponse, type NextRequest } from "next/server";
import { updateDropInSchema } from "@matos/shared";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog, writeAuditLogStrict } from "@/lib/audit/log";

// PATCH /api/drop-ins/[id] — coach/owner (flow audit 4.6): the mat fee
// (paid later, or corrected). Only fee/fee_paid are updatable (column grant).
export const PATCH = withAuth(
  async (_request: NextRequest, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No visit id provided.");
    const supabase = createClient();

    const { data: before } = await supabase
      .from("drop_in_visits")
      .select("fee, fee_paid")
      .eq("id", id)
      .eq("gym_id", context.gymId)
      .maybeSingle();
    if (!before) return apiError(404, "NOT_FOUND", "That visit wasn't found.");

    const change: { fee?: number | null; fee_paid?: boolean } = {};
    if (input.fee !== undefined) change.fee = input.fee;
    if (input.fee_paid !== undefined) change.fee_paid = input.fee_paid;

    const { data: rows, error } = await supabase
      .from("drop_in_visits")
      .update(change)
      .eq("id", id)
      .eq("gym_id", context.gymId)
      .select("id");
    if (error || !rows || rows.length === 0) {
      console.error("[drop-ins] update failed", error);
      return apiError(
        500,
        "DROP_IN_UPDATE_FAILED",
        "Something went wrong — the change wasn't saved.",
      );
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "drop_in.updated",
      entityType: "drop_in_visits",
      entityId: id,
      beforeState: { fee: before.fee, fee_paid: before.fee_paid },
      afterState: change,
      initiatedBy: "coach_manual",
    });
    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach", schema: updateDropInSchema },
);

// DELETE /api/drop-ins/[id] — coach/owner. Removes a visitor's record (a
// mistake, or their personal details on request). Audit first.
export const DELETE = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No visit id provided.");
    const supabase = createClient();

    const { data: before } = await supabase
      .from("drop_in_visits")
      .select("id, class_id, visit_date")
      .eq("id", id)
      .eq("gym_id", context.gymId)
      .maybeSingle();
    if (!before) return apiError(404, "NOT_FOUND", "That visit wasn't found.");

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "drop_in.deleted",
      entityType: "drop_in_visits",
      entityId: id,
      beforeState: { class_id: before.class_id, visit_date: before.visit_date },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      return apiError(500, "AUDIT_FAILED", "Something went wrong — nothing was deleted.");
    }

    const { error } = await supabase.from("drop_in_visits").delete().eq("id", id);
    if (error) {
      console.error("[drop-ins] delete failed", error);
      return apiError(500, "DROP_IN_DELETE_FAILED", "Something went wrong — nothing was deleted.");
    }
    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach" },
);
