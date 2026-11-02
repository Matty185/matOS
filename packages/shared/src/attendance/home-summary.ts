import { format, startOfWeek, subWeeks } from "date-fns";
import type { Database } from "../types/database";
import {
  addDaysToDate,
  sessionsOnDate,
  type ClassSession,
  type SessionChange,
} from "../classes/sessions";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

// "Streak" = consecutive Mon-Sun weeks with at least one check-in, walking
// backward from the most recent week that has one. The current week doesn't
// break the streak just because it's not over yet — if it has no check-in
// so far, counting starts from last week instead so a Tuesday-morning visit
// doesn't reset a streak that's still very much alive.
//
// Extracted from apps/web's (athlete)/home/page.tsx (Stage M1) so mobile's
// Home screen computes the identical number rather than re-deriving it —
// web and mobile must never diverge on a number.
export function computeAttendanceStreak(checkInDates: string[]): number {
  if (checkInDates.length === 0) return 0;
  const weeksWithCheckin = new Set(
    checkInDates.map((d) =>
      format(startOfWeek(new Date(`${d}T00:00:00`), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    ),
  );
  let cursor = startOfWeek(new Date(), { weekStartsOn: 1 });
  if (!weeksWithCheckin.has(format(cursor, "yyyy-MM-dd"))) {
    cursor = subWeeks(cursor, 1);
  }
  let streak = 0;
  while (weeksWithCheckin.has(format(cursor, "yyyy-MM-dd"))) {
    streak++;
    cursor = subWeeks(cursor, 1);
  }
  return streak;
}

export type UpcomingClass = ClassSession<ClassRow> & {
  /** Local-midnight Date for the listed day (kept for existing callers). */
  dateValue: Date;
};

// Walks the next `daysAhead` calendar days (default 7) from `fromDate`
// (YYYY-MM-DD in the gym's zone; defaults to the device's today), listing the
// gym's active classes with one-off changes applied (flow audit 3.2):
// cancelled and moved-away sessions stay listed so members see the change.
// Capped at `cap` total entries (default 5) — not 5 per day.
export function computeUpcomingClasses(
  activeClasses: ClassRow[],
  options?: { daysAhead?: number; cap?: number; fromDate?: string; changes?: SessionChange[] },
): UpcomingClass[] {
  const daysAhead = options?.daysAhead ?? 7;
  const cap = options?.cap ?? 5;
  const fromDate = options?.fromDate ?? format(new Date(), "yyyy-MM-dd");
  const changes = options?.changes ?? [];

  const upcoming: UpcomingClass[] = [];
  for (let offset = 0; offset < daysAhead && upcoming.length < cap; offset++) {
    const date = addDaysToDate(fromDate, offset);
    for (const session of sessionsOnDate(activeClasses, changes, date)) {
      if (upcoming.length >= cap) break;
      upcoming.push({ ...session, dateValue: new Date(`${date}T00:00:00`) });
    }
  }
  return upcoming;
}
