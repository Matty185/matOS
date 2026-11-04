import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { resolveCheckInSession } from "@/lib/attendance/check-in-session";
import { loadLinkedChild } from "@/lib/family/guardian-link";
import { familyCheckInSchema } from "@matos/shared";

// POST /api/family/check-in — a linked parent checks their child in. Flow
// audit 8.2. Same rules as self check-in (resolveCheckInSession: today's
// session in the gym's zone, one-off changes, the window). RLS
// (attendance_insert_guardian) is the real gate: the caller must be the
// child's linked guardian, checked_in_by 'guardian'. Audit best effort, like
// self check-in.
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();
    const child = await loadLinkedChild(supabase, context.memberId, input.member_id);
    if (!child || child.gym_id !== context.gymId) {
      return apiError(404, "NOT_FOUND", "You're not linked to that member.");
    }
    if (!child.active) {
      return apiError(409, "MEMBER_INACTIVE", `${child.first_name}'s membership isn't active.`);
    }

    const now = new Date();
    const resolved = await resolveCheckInSession(supabase, context.gymId, input.class_id, now);
    if (!resolved.ok) return resolved.response;

    const { data: created, error } = await supabase
      .from("attendance")
      .insert({
        member_id: child.id,
        class_id: input.class_id,
        gym_id: context.gymId,
        checked_in_at: now.toISOString(),
        checked_in_by: "guardian",
        // Overwritten by the attendance_set_checked_in_date trigger.
        checked_in_date: resolved.localDate,
      })
      .select("id")
      .single();
    if (error || !created) {
      // Flow audit 3.5: attendance_zz_capacity refuses a full session.
      if (error?.code === "MF001") {
        return apiError(409, "CLASS_FULL", "This class is full. Ask a coach if there's room.");
      }
      if (error?.code === "23505") {
        return apiError(
          409,
          "ALREADY_CHECKED_IN",
          `${child.first_name} is already checked in for this class today.`,
        );
      }
      console.error("[family] check-in failed", error?.code);
      return apiError(500, "CHECK_IN_FAILED", "Something went wrong — check-in wasn't saved.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "attendance.guardian_checked_in",
      entityType: "attendance",
      entityId: created.id,
      afterState: { member_id: child.id, class_id: input.class_id },
      initiatedBy: "self_service",
    });

    return NextResponse.json({ success: true }, { status: 201 });
  },
  { schema: familyCheckInSchema },
);
