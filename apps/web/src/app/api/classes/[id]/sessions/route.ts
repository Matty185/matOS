import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLogStrict } from "@/lib/audit/log";
import { getGymTimeZone } from "@/lib/time/gym-timezone";
import {
  addDaysToDate,
  classSessionChangeSchema,
  dayOfWeekOfDate,
  gymWallClock,
} from "@matos/shared";

/** How far ahead a session can be cancelled or moved. */
const MAX_DAYS_AHEAD = 180;

function daysBetween(a: string, b: string) {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

// POST /api/classes/[id]/sessions — coach/owner. Flow audit 3.2: cancel one
// session of a recurring class, or move it to another time and/or a date up
// to six days away. Stored as a class_session_changes exception row; the
// weekly template is untouched. RLS (insert_staff) + the derive trigger are
// the boundary; the checks below give friendly messages first.
//
// Only today or later can be changed, and not a session people have already
// checked in to (their attendance would end up pointing at a session that,
// per the schedule, never happened). Audited strictly: if the audit row
// can't be written, the change is removed again.
export const POST = withAuth(
  async (_request: NextRequest, context, input, params) => {
    const classId = params.id;
    if (!classId) return apiError(400, "MISSING_ID", "No class id provided.");
    const supabase = createClient();

    const { data: classRow } = await supabase
      .from("classes")
      .select("id, name, day_of_week, start_time, active")
      .eq("id", classId)
      .maybeSingle();
    if (!classRow) return apiError(404, "CLASS_NOT_FOUND", "That class wasn't found.");
    if (!classRow.active) {
      return apiError(
        409,
        "CLASS_INACTIVE",
        "This class is inactive, so it has no sessions to change.",
      );
    }

    const timeZone = await getGymTimeZone(supabase, context.gymId);
    const today = gymWallClock(new Date(), timeZone).date;

    if (input.session_date < today) {
      return apiError(400, "PAST_SESSION", "That session has already happened.");
    }
    if (input.session_date > addDaysToDate(today, MAX_DAYS_AHEAD)) {
      return apiError(400, "TOO_FAR_AHEAD", "You can only change sessions in the next six months.");
    }
    if (dayOfWeekOfDate(input.session_date) !== classRow.day_of_week) {
      return apiError(400, "WRONG_DAY", "This class doesn't run on that date.");
    }

    const moving = input.action === "move";
    const newDate = moving ? input.new_date! : null;
    const newTime = moving ? input.new_start_time! : null;
    if (moving && newDate && newTime) {
      if (newDate < today) {
        return apiError(400, "NEW_DATE_PAST", "Pick a new date from today onwards.");
      }
      if (Math.abs(daysBetween(input.session_date, newDate)) > 6) {
        return apiError(
          400,
          "MOVE_TOO_FAR",
          "A session can move up to six days either way. For anything else, cancel it.",
        );
      }
      if (newDate === input.session_date && newTime === classRow.start_time.slice(0, 5)) {
        return apiError(400, "NO_CHANGE", "That's the class's usual date and time.");
      }
    }

    const [{ data: existing }, { count: checkedIn }] = await Promise.all([
      supabase
        .from("class_session_changes")
        .select("id, session_date, kind, new_date")
        .eq("class_id", classId)
        .or(
          newDate
            ? `session_date.eq.${input.session_date},new_date.eq.${newDate}`
            : `session_date.eq.${input.session_date}`,
        ),
      supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .eq("class_id", classId)
        .eq("checked_in_date", input.session_date),
    ]);
    if (existing?.some((e) => e.session_date === input.session_date)) {
      return apiError(
        409,
        "ALREADY_CHANGED",
        "This session has already been changed. Undo that change first.",
      );
    }
    if (existing?.some((e) => e.kind === "moved" && e.new_date === newDate)) {
      return apiError(
        409,
        "TARGET_TAKEN",
        "Another session of this class has already been moved to that date.",
      );
    }
    if ((checkedIn ?? 0) > 0) {
      return apiError(
        409,
        "HAS_ATTENDANCE",
        `${checkedIn} ${checkedIn === 1 ? "person has" : "people have"} already checked in to this session. Remove them on the Attendance page first.`,
      );
    }

    const { data: created, error: insertError } = await supabase
      .from("class_session_changes")
      .insert({
        class_id: classId,
        // Overwritten by the derive trigger from the class; RLS then checks it.
        gym_id: context.gymId,
        session_date: input.session_date,
        kind: moving ? "moved" : "cancelled",
        new_date: newDate,
        new_start_time: newTime,
        note: input.note ?? null,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      if (insertError?.code === "23505") {
        return apiError(
          409,
          "ALREADY_CHANGED",
          "This session (or the new date) already has a change. Refresh and try again.",
        );
      }
      if (insertError?.code === "22023" || insertError?.code === "23514") {
        return apiError(400, "INVALID_CHANGE", "That change isn't valid for this class.");
      }
      console.error("[class-sessions] insert failed", insertError?.code);
      return apiError(500, "SESSION_CHANGE_FAILED", "Something went wrong — nothing was changed.");
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: moving ? "class.session_moved" : "class.session_cancelled",
      entityType: "classes",
      entityId: classId,
      afterState: {
        change_id: created.id,
        session_date: input.session_date,
        new_date: newDate,
        new_start_time: newTime,
        note: input.note ?? null,
      },
      initiatedBy: input.agent_query ? "agent" : "coach_manual",
      agentQuery: input.agent_query ?? null,
    });
    if (!audited) {
      const { error: revertError } = await supabase
        .from("class_session_changes")
        .delete()
        .eq("id", created.id);
      if (revertError) console.error("[class-sessions] revert after audit failure failed");
      return apiError(500, "SESSION_CHANGE_FAILED", "Something went wrong — nothing was changed.");
    }

    return NextResponse.json({ success: true, changeId: created.id }, { status: 201 });
  },
  { requiredRole: "coach", schema: classSessionChangeSchema },
);
