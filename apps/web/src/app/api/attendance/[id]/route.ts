import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLogStrict } from "@/lib/audit/log";

// DELETE /api/attendance/[id] — coach/owner. Flow audit 4.3: undo a wrong
// attendance mark (wrong person, wrong class). attendance_delete_staff RLS
// scopes it to the caller's gym. Audited (strictly, before the delete) with
// what was removed, keyed to the member so the log reads "removed a check-in
// for <name>" even though the attendance row no longer exists.
export const DELETE = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No attendance id provided.");

    const supabase = createClient();
    const { data: row } = await supabase
      .from("attendance")
      .select("id, member_id, class_id, checked_in_at, checked_in_by")
      .eq("id", id)
      .maybeSingle();
    if (!row) return apiError(404, "NOT_FOUND", "That check-in wasn't found.");

    // Audit first (fail-closed): the row is gone afterwards, so an unlogged
    // deletion would leave no trace at all.
    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "attendance.removed",
      entityType: "members",
      entityId: row.member_id,
      beforeState: {
        attendance_id: row.id,
        class_id: row.class_id,
        checked_in_at: row.checked_in_at,
        checked_in_by: row.checked_in_by,
      },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      return apiError(500, "REMOVE_FAILED", "Something went wrong — nothing was removed.");
    }

    const { error } = await supabase.from("attendance").delete().eq("id", row.id);
    if (error) {
      console.error("[attendance] delete failed after audit", error);
      return apiError(500, "REMOVE_FAILED", "Something went wrong — nothing was removed.");
    }

    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach" },
);
