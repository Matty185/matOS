import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLogStrict } from "@/lib/audit/log";
import { getGymTimeZone } from "@/lib/time/gym-timezone";
import { holdWindowError } from "@/lib/payments/hold-bounds";
import { editHoldSchema, gymWallClock } from "@matos/shared";

// Flow audit 2.4: change or remove a membership hold. Coach/owner; RLS
// (membership_holds_*_staff) scopes both to the caller's gym. Only the end
// month can change (end a hold early, or extend it) — the table grants
// UPDATE on end_month alone.

async function loadHold(id: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("membership_holds")
    .select("id, member_id, start_month, end_month")
    .eq("id", id)
    .maybeSingle();
  return { supabase, hold: data };
}

// PATCH /api/holds/[id] — { end_month: "YYYY-MM" }. Audited strictly: the
// old end month is put back if the audit row can't be written.
export const PATCH = withAuth(
  async (_request: NextRequest, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No hold id provided.");
    const { supabase, hold } = await loadHold(id);
    if (!hold) return apiError(404, "NOT_FOUND", "That hold wasn't found.");

    const startMonth = hold.start_month.slice(0, 7);
    const timeZone = await getGymTimeZone(supabase, context.gymId);
    const today = gymWallClock(new Date(), timeZone).date;
    // The start is fixed, so only the end and span limits can fail here; a
    // hold that started long ago may still be shortened.
    const windowError = holdWindowError(startMonth, input.end_month, today, { checkStart: false });
    if (windowError) {
      return apiError(400, "INVALID_HOLD", windowError);
    }
    const newEnd = `${input.end_month}-01`;
    if (newEnd === hold.end_month) return NextResponse.json({ success: true });

    const { data: updated, error } = await supabase
      .from("membership_holds")
      .update({ end_month: newEnd })
      .eq("id", id)
      .select("id");
    if (error?.code === "23P01") {
      return apiError(409, "HOLD_OVERLAPS", "That would overlap another hold for this member.");
    }
    if (error || !updated || updated.length === 0) {
      console.error("[holds] update failed", error?.code);
      return apiError(500, "HOLD_UPDATE_FAILED", "Something went wrong — the change wasn't saved.");
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.hold_changed",
      entityType: "membership_holds",
      entityId: id,
      beforeState: { member_id: hold.member_id, end_month: hold.end_month },
      afterState: { member_id: hold.member_id, end_month: newEnd },
      initiatedBy: input.agent_query ? "agent" : "coach_manual",
      agentQuery: input.agent_query ?? null,
    });
    if (!audited) {
      await supabase.from("membership_holds").update({ end_month: hold.end_month }).eq("id", id);
      return apiError(500, "HOLD_UPDATE_FAILED", "Something went wrong — the change wasn't saved.");
    }
    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach", schema: editHoldSchema },
);

// DELETE /api/holds/[id] — remove a hold entirely (e.g. added by mistake).
// Audit-first, fail-closed.
export const DELETE = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No hold id provided.");
    const { supabase, hold } = await loadHold(id);
    if (!hold) return apiError(404, "NOT_FOUND", "That hold wasn't found.");

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.hold_removed",
      entityType: "membership_holds",
      entityId: id,
      beforeState: {
        member_id: hold.member_id,
        start_month: hold.start_month,
        end_month: hold.end_month,
      },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      return apiError(500, "HOLD_DELETE_FAILED", "Something went wrong — nothing was changed.");
    }

    const { data: deleted, error } = await supabase
      .from("membership_holds")
      .delete()
      .eq("id", id)
      .select("id");
    if (error || !deleted || deleted.length === 0) {
      console.error("[holds] delete failed after audit", error?.code);
      return apiError(500, "HOLD_DELETE_FAILED", "Something went wrong — nothing was changed.");
    }
    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach" },
);
