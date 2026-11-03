import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkInWindow,
  formatSessionDate,
  gymWallClock,
  sessionRuns,
  sessionsOnDate,
  DEFAULT_GYM_TIMEZONE,
  type Database,
  type SessionChange,
} from "@matos/shared";
import { apiError } from "@/lib/api/response";
import { fetchSessionChanges } from "@/lib/classes/session-changes";

/**
 * The rules every member-initiated check-in shares (self check-in, and a
 * parent checking a child in, flow audit 8.2): the class exists and is
 * active, runs today in the gym's zone (one-off changes applied, failing
 * closed if they can't be read), and the window is open (30 min before
 * start to the end of class). Returns the gym-local date to stamp, or the
 * error response to send.
 */
export async function resolveCheckInSession(
  supabase: SupabaseClient<Database>,
  gymId: string,
  classId: string,
  effectiveTime: Date,
): Promise<{ ok: true; localDate: string } | { ok: false; response: Response }> {
  const fail = (response: Response) => ({ ok: false as const, response });

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("id, day_of_week, start_time, duration_minutes, active")
    .eq("id", classId)
    .single();
  if (classError || !classRow) {
    return fail(apiError(404, "CLASS_NOT_FOUND", "That class doesn't exist."));
  }
  if (!classRow.active) {
    return fail(apiError(409, "CLASS_INACTIVE", "This class is no longer active."));
  }

  const { data: gym } = await supabase.from("gyms").select("timezone").eq("id", gymId).single();
  const local = gymWallClock(effectiveTime, gym?.timezone ?? DEFAULT_GYM_TIMEZONE);

  let changes: SessionChange[];
  try {
    changes = await fetchSessionChanges(supabase, local.date, local.date, classRow.id);
  } catch {
    return fail(apiError(500, "CHECK_IN_FAILED", "Something went wrong — check-in wasn't saved."));
  }
  const listed = sessionsOnDate([classRow], changes, local.date);
  const session = listed.find((s) => sessionRuns(s.status));
  if (!session) {
    const today = listed[0];
    if (today?.status === "cancelled") {
      return fail(apiError(409, "SESSION_CANCELLED", "This class is cancelled today."));
    }
    if (today?.status === "moved_away" && today.change?.new_date) {
      return fail(
        apiError(
          409,
          "SESSION_MOVED",
          `This class was moved to ${formatSessionDate(today.change.new_date)}.`,
        ),
      );
    }
    return fail(apiError(400, "NOT_TODAY", "This class isn't scheduled for today."));
  }

  const { opens, closes } = checkInWindow(session.startTime, classRow.duration_minutes);
  if (local.minutesOfDay < opens) {
    return fail(apiError(400, "TOO_EARLY", "Check-in opens 30 minutes before class starts."));
  }
  if (local.minutesOfDay > closes) {
    return fail(apiError(400, "TOO_LATE", "Check-in has closed for this class."));
  }
  return { ok: true, localDate: local.date };
}
