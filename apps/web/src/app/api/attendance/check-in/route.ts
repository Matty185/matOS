import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { checkInSchema } from "@matos/shared";

const CHECK_IN_OPENS_MINUTES_BEFORE = 30;

// Stage M7: how long a queued-offline check-in stays eligible to
// reconcile. Generous enough to cover a genuinely offline weekend at a
// remote location, bounded enough that a client can't claim an
// arbitrarily old attempt happened to land inside some valid window.
const MAX_OFFLINE_QUEUE_HOURS = 48;
// Real clocks drift a little; this is not a security boundary (the real
// bound is MAX_OFFLINE_QUEUE_HOURS above) — just enough slack that a
// client whose clock is a few minutes fast doesn't get rejected for
// submitting "in the future" the instant they tap the button online.
const CLOCK_SKEW_TOLERANCE_MINUTES = 5;

// POST /api/attendance/check-in — any authenticated member, always
// themselves (context.memberId, never trusted from input — matches RLS's
// attendance_insert_self policy, which independently enforces the same
// thing at the DB layer). The check-in window (opens 30 min before class,
// closes at class end, per plan §7) is validated server-side here, not just
// by disabling the button client-side — a savvy athlete could otherwise
// call this endpoint directly and bypass a client-only check.
//
// Stage M7 ("check-in queued offline... with server-side timestamp
// reconciliation"): when input.attempted_at is present (mobile's offline
// queue, apps/mobile/src/lib/checkin-queue.ts, submitting a check-in after
// reconnecting), every time-based decision below — which day this is,
// whether the window was open — is evaluated against that original
// attempt time, not server-receipt time. Without this, a check-in
// genuinely attempted during class but stuck offline for even a few
// minutes would fail TOO_LATE the moment it finally reaches the server,
// and a successful one would silently record the wrong time. The
// timestamp is still never blindly trusted: bounded to a real past
// window (MAX_OFFLINE_QUEUE_HOURS) and a small clock-skew allowance
// against the future, then re-validated against the *actual* check-in
// window below exactly as server-receipt time always was — a client
// can't claim a time outside a real valid window any more than it could
// before this stage.
//
// KNOWN SIMPLIFICATION: classes.start_time has no timezone — this compares
// it against server "now" (or the reconciled attempt time) as if both are
// the same wall-clock time. Correct only when the server and the gym are
// in the same timezone (true for a single-gym alpha running near its one
// demo gym; not correct in general). No gym-timezone column exists yet to
// do this properly — flagged in Stage 5 notes, not solved here.
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();

    const { data: classRow, error: classError } = await supabase
      .from("classes")
      .select("id, day_of_week, start_time, duration_minutes, active")
      .eq("id", input.class_id)
      .single();

    if (classError || !classRow) {
      return apiError(404, "CLASS_NOT_FOUND", "That class doesn't exist.");
    }

    if (!classRow.active) {
      return apiError(409, "CLASS_INACTIVE", "This class is no longer active.");
    }

    const receivedAt = new Date();
    let effectiveTime = receivedAt;
    const offlineQueued = input.attempted_at !== undefined;

    if (input.attempted_at) {
      const attempted = new Date(input.attempted_at);
      if (attempted.getTime() > receivedAt.getTime() + CLOCK_SKEW_TOLERANCE_MINUTES * 60 * 1000) {
        return apiError(400, "INVALID_TIMESTAMP", "That check-in time is in the future.");
      }
      if (receivedAt.getTime() - attempted.getTime() > MAX_OFFLINE_QUEUE_HOURS * 60 * 60 * 1000) {
        return apiError(
          400,
          "TIMESTAMP_TOO_OLD",
          "This queued check-in is too old to submit — check in again.",
        );
      }
      effectiveTime = attempted;
    }

    if (classRow.day_of_week !== effectiveTime.getDay()) {
      return apiError(400, "NOT_TODAY", "This class isn't scheduled for today.");
    }

    const timeParts = classRow.start_time.split(":").map(Number);
    const hours = timeParts[0] ?? 0;
    const minutes = timeParts[1] ?? 0;
    const classStart = new Date(effectiveTime);
    classStart.setHours(hours, minutes, 0, 0);
    const windowOpen = new Date(classStart.getTime() - CHECK_IN_OPENS_MINUTES_BEFORE * 60 * 1000);
    const windowClose = new Date(classStart.getTime() + classRow.duration_minutes * 60 * 1000);

    if (effectiveTime < windowOpen) {
      return apiError(400, "TOO_EARLY", "Check-in opens 30 minutes before class starts.");
    }
    if (effectiveTime > windowClose) {
      return apiError(400, "TOO_LATE", "Check-in has closed for this class.");
    }

    const checkedInAt = effectiveTime.toISOString();
    const { data: created, error: insertError } = await supabase
      .from("attendance")
      .insert({
        member_id: context.memberId,
        class_id: input.class_id,
        gym_id: context.gymId,
        checked_in_at: checkedInAt,
        checked_in_by: "self",
        checked_in_date: checkedInAt.slice(0, 10),
        offline_queued: offlineQueued,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      if (insertError?.code === "23505") {
        return apiError(
          409,
          "ALREADY_CHECKED_IN",
          "You're already checked in for this class today.",
        );
      }
      return apiError(500, "CHECK_IN_FAILED", "Something went wrong — check-in wasn't saved.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "attendance.self_checked_in",
      entityType: "attendance",
      entityId: created.id,
      afterState: {
        class_id: input.class_id,
        checked_in_at: checkedInAt,
        offline_queued: offlineQueued,
      },
      initiatedBy: "self_service",
    });

    return NextResponse.json({ success: true }, { status: 201 });
  },
  { schema: checkInSchema },
);
