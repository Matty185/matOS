import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLog } from "@/lib/audit/log";
import { resolveKioskDevice } from "@/lib/kiosk/device";
import { kioskSessionsOn } from "@/lib/kiosk/sessions";
import { checkInWindow, gymWallClock, kioskCheckInSchema, sessionRuns } from "@matos/shared";

// POST /api/kiosk/check-in — kiosk device only. Flow audit 4.4: check a
// member in to one of today's sessions from the front-desk tablet. Same
// rules as self check-in (session runs today after one-off changes, window
// opens 30 min before and closes at the end), evaluated in the gym's zone
// at receipt time. Member and class must be active and in the device's gym
// (checked here, and the attendance trigger re-checks they share a gym).
// Service-role insert: the tablet has no auth user. Audited like self
// check-in (best effort), with the device id.
/**
 * Check-ins per gym per minute through kiosks. A real front desk does a few
 * a minute at most; this bounds what a copied device cookie can do (mass
 * check-ins) without getting in the way of a busy class.
 */
const MAX_CHECK_INS_PER_MINUTE = 30;

export async function POST(request: NextRequest) {
  const device = await resolveKioskDevice(request);
  if (!device) {
    return apiError(401, "KIOSK_NOT_SET_UP", "This tablet isn't set up as a kiosk.");
  }
  const parsed = kioskCheckInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "VALIDATION_ERROR", "Pick a class and a name.");
  const { class_id: classId, member_id: memberId } = parsed.data;

  const supabase = createServiceRoleClient();
  const { count: recent, error: rateError } = await supabase
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", device.gymId)
    .eq("action", "attendance.kiosk_checked_in")
    .gte("timestamp", new Date(Date.now() - 60_000).toISOString());
  if (rateError) {
    return apiError(500, "CHECK_IN_FAILED", "Something went wrong — check-in wasn't saved.");
  }
  if ((recent ?? 0) >= MAX_CHECK_INS_PER_MINUTE) {
    return apiError(429, "SLOW_DOWN", "Too many check-ins at once. Wait a moment and try again.");
  }

  const { data: member } = await supabase
    .from("members")
    .select("id, first_name")
    .eq("id", memberId)
    .eq("gym_id", device.gymId)
    .eq("active", true)
    .neq("role", "guardian")
    .maybeSingle();
  if (!member) return apiError(404, "MEMBER_NOT_FOUND", "That name isn't on the list.");

  const now = new Date();
  const local = gymWallClock(now, device.timeZone);
  let sessions;
  try {
    sessions = await kioskSessionsOn(device.gymId, local.date, classId);
  } catch {
    return apiError(500, "CHECK_IN_FAILED", "Something went wrong — check-in wasn't saved.");
  }
  const session = sessions.find((s) => sessionRuns(s.status));
  if (!session) {
    return apiError(409, "NOT_RUNNING", "That class isn't running today.");
  }
  const window = checkInWindow(session.startTime, session.classRow.duration_minutes);
  if (local.minutesOfDay < window.opens) {
    return apiError(400, "TOO_EARLY", "Check-in opens 30 minutes before class starts.");
  }
  if (local.minutesOfDay > window.closes) {
    return apiError(400, "TOO_LATE", "Check-in has closed for this class.");
  }

  const checkedInAt = now.toISOString();
  const { data: created, error } = await supabase
    .from("attendance")
    .insert({
      member_id: member.id,
      class_id: classId,
      gym_id: device.gymId,
      checked_in_at: checkedInAt,
      checked_in_by: "kiosk",
      // Overwritten by the attendance_set_checked_in_date trigger.
      checked_in_date: local.date,
    })
    .select("id")
    .single();
  if (error || !created) {
    if (error?.code === "23505") {
      return apiError(
        409,
        "ALREADY_CHECKED_IN",
        `${member.first_name}, you're already checked in.`,
      );
    }
    console.error("[kiosk] check-in insert failed", error?.code);
    return apiError(500, "CHECK_IN_FAILED", "Something went wrong — check-in wasn't saved.");
  }

  await writeAuditLog({
    gymId: device.gymId,
    actorId: null,
    action: "attendance.kiosk_checked_in",
    entityType: "attendance",
    entityId: created.id,
    afterState: { class_id: classId, member_id: member.id, kiosk_device_id: device.id },
    initiatedBy: "kiosk",
  });

  return NextResponse.json(
    { success: true, firstName: member.first_name, className: session.classRow.name },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
