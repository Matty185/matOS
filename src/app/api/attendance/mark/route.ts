import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { markAttendanceSchema } from "@/lib/validation/attendance";

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
    const checkedInAt = input.checked_in_at ?? new Date().toISOString();

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
      initiatedBy: "coach_manual",
    });

    return NextResponse.json({ success: true }, { status: 201 });
  },
  { requiredRole: "coach", schema: markAttendanceSchema },
);
