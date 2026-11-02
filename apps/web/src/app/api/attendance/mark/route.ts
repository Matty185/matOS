import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import {
  gymLocalToInstant,
  gymWallClock,
  markAttendanceSchema,
  sessionRuns,
  sessionsOnDate,
  type SessionChange,
} from "@matos/shared";
import { fetchSessionChanges } from "@/lib/classes/session-changes";
import { getGymTimeZone } from "@/lib/time/gym-timezone";

// POST /api/attendance/mark — coach/owner only. Any member, any class, any
// date (including backdated — Stage 1's attendance schema was explicitly
// designed for this). gym_id/checked_in_date are placeholder values the
// generated Insert type requires but Stage 1's triggers
// (derive_and_validate_attendance_gym_id, attendance_set_checked_in_date)
// unconditionally overwrite before the row is actually written — including
// rejecting the write outright if member_id/class_id turn out to belong to
// different gyms.
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();
    const now = new Date();
    let checkedInAt = input.checked_in_at ?? now.toISOString();

    if (input.date) {
      // RLS scopes this to the caller's gym: another gym's class isn't found.
      const { data: classRow } = await supabase
        .from("classes")
        .select("start_time, day_of_week")
        .eq("id", input.class_id)
        .maybeSingle();
      if (!classRow) return apiError(404, "CLASS_NOT_FOUND", "That class wasn't found.");

      const timeZone = await getGymTimeZone(supabase, context.gymId);
      const today = gymWallClock(now, timeZone).date;
      if (input.date > today) {
        return apiError(400, "FUTURE_DATE", "You can't mark attendance for a future date.");
      }
      // Flow audit 3.2: one-off changes decide whether (and when) the class
      // ran on this date. Fail closed if they can't be read.
      let changes: SessionChange[];
      try {
        changes = await fetchSessionChanges(supabase, input.date, input.date, input.class_id);
      } catch {
        return apiError(
          500,
          "MARK_ATTENDANCE_FAILED",
          "Something went wrong — attendance wasn't saved.",
        );
      }
      const listed = sessionsOnDate([{ id: input.class_id, ...classRow }], changes, input.date);
      const session = listed.find((s) => sessionRuns(s.status));
      if (!session) {
        if (listed[0]?.status === "cancelled") {
          return apiError(409, "SESSION_CANCELLED", "That session was cancelled.");
        }
        if (listed[0]?.status === "moved_away") {
          return apiError(409, "SESSION_MOVED", "That session was moved to another date.");
        }
        return apiError(400, "WRONG_DAY", "That class doesn't run on this date.");
      }
      const classStart = gymLocalToInstant(input.date, session.startTime, timeZone);
      // Marked before today's class starts: stamp now (still today).
      checkedInAt = (classStart > now ? now : classStart).toISOString();
    }

    const { data: created, error: insertError } = await supabase
      .from("attendance")
      .insert({
        member_id: input.member_id,
        class_id: input.class_id,
        gym_id: context.gymId,
        checked_in_at: checkedInAt,
        checked_in_by: "coach",
        checked_in_date: checkedInAt.slice(0, 10),
      })
      .select("id")
      .single();

    if (insertError || !created) {
      if (insertError?.code === "23505") {
        return apiError(
          409,
          "ALREADY_CHECKED_IN",
          "This member is already marked present for that class and date.",
        );
      }
      return apiError(
        500,
        "MARK_ATTENDANCE_FAILED",
        "Something went wrong — attendance wasn't saved.",
      );
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "attendance.marked",
      entityType: "attendance",
      entityId: created.id,
      afterState: {
        member_id: input.member_id,
        class_id: input.class_id,
        checked_in_at: checkedInAt,
      },
      initiatedBy: input.agent_query ? "agent" : "coach_manual",
      agentQuery: input.agent_query ?? null,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  },
  { requiredRole: "coach", schema: markAttendanceSchema },
);
