import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLogStrict } from "@/lib/audit/log";
import { getGymTimeZone } from "@/lib/time/gym-timezone";
import { gymWallClock } from "@matos/shared";

// DELETE /api/class-session-changes/[id] — coach/owner. Flow audit 3.2: undo
// a cancellation or move, so the session runs as normal again. RLS
// (delete_staff) scopes it to the caller's gym.
//
// Refused once either date involved is in the past (the schedule for days
// that already happened stays as it was), and for a move when anyone has
// already checked in to the moved session (undoing it would leave their
// attendance on a date the class then never ran). Audit-first, fail-closed.
export const DELETE = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No change id provided.");
    const supabase = createClient();

    const { data: row } = await supabase
      .from("class_session_changes")
      .select("id, class_id, session_date, kind, new_date, new_start_time, note")
      .eq("id", id)
      .maybeSingle();
    if (!row) return apiError(404, "NOT_FOUND", "That change wasn't found.");

    const timeZone = await getGymTimeZone(supabase, context.gymId);
    const today = gymWallClock(new Date(), timeZone).date;
    const earliest =
      row.new_date && row.new_date < row.session_date ? row.new_date : row.session_date;
    if (earliest < today) {
      return apiError(
        409,
        "PAST_SESSION",
        "That session has already happened, so it can't be undone.",
      );
    }

    // A same-day time change leaves the date as it was, so check-ins on it
    // stay valid after an undo.
    if (row.kind === "moved" && row.new_date && row.new_date !== row.session_date) {
      const { count, error } = await supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .eq("class_id", row.class_id)
        .eq("checked_in_date", row.new_date);
      if (error) {
        return apiError(500, "UNDO_FAILED", "Something went wrong — nothing was changed.");
      }
      if ((count ?? 0) > 0) {
        return apiError(
          409,
          "HAS_ATTENDANCE",
          "People have already checked in to the moved session, so it can't be undone.",
        );
      }
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "class.session_change_undone",
      entityType: "classes",
      entityId: row.class_id,
      beforeState: {
        change_id: row.id,
        kind: row.kind,
        session_date: row.session_date,
        new_date: row.new_date,
        new_start_time: row.new_start_time,
        note: row.note,
      },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      return apiError(500, "UNDO_FAILED", "Something went wrong — nothing was changed.");
    }

    const { error } = await supabase.from("class_session_changes").delete().eq("id", row.id);
    if (error) {
      console.error("[class-sessions] delete failed after audit", error.code);
      return apiError(500, "UNDO_FAILED", "Something went wrong — nothing was changed.");
    }

    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach" },
);
