// Flow audit 3.2: one-off changes to a recurring class.
//
// Classes are a weekly template (CLAUDE.md rule 7). class_session_changes
// rows are per-date exceptions: a session cancelled, or moved to another time
// and/or a date up to six days away. Every surface (check-in route, coach
// mark route, athlete home and check-in, coach attendance and classes pages)
// resolves "what runs on this date" through sessionsOnDate, so they agree.
//
// Dates are plain YYYY-MM-DD calendar dates in the gym's zone; weekday maths
// is done in UTC on those strings so the device/server zone never matters.

import type { Database } from "../types/database";

export type SessionChange = Pick<
  Database["public"]["Tables"]["class_session_changes"]["Row"],
  "id" | "class_id" | "session_date" | "kind" | "new_date" | "new_start_time" | "note"
>;

type ClassLike = { id: string; day_of_week: number; start_time: string };

/**
 * scheduled  — runs as normal.
 * cancelled  — normally on this date; cancelled.
 * moved_away — normally on this date; moved to change.new_date/new_start_time.
 * moved_in   — runs on this date because of a move (possibly a same-day time
 *              change; then originalDate === date).
 */
export type SessionStatus = "scheduled" | "cancelled" | "moved_away" | "moved_in";

export type ClassSession<C extends ClassLike = ClassLike> = {
  classRow: C;
  /** The date this entry is listed under. */
  date: string;
  /** The time it runs (moved_in) or would have run (others), "HH:MM[:SS]". */
  startTime: string;
  status: SessionStatus;
  change: SessionChange | null;
};

/** 0 = Sunday for a YYYY-MM-DD calendar date, independent of any zone. */
export function dayOfWeekOfDate(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** YYYY-MM-DD plus n calendar days. */
export function addDaysToDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** True when the session actually takes place (check-in/marking allowed). */
export function sessionRuns(status: SessionStatus): boolean {
  return status === "scheduled" || status === "moved_in";
}

/**
 * Every session listed on `date` for the given classes, sorted by time.
 * Pass changes covering at least date ± 6 days (moves reach that far).
 * A change whose session_date isn't on its class's current weekday (the class
 * was later moved to another day in the template) is ignored.
 */
export function sessionsOnDate<C extends ClassLike>(
  classes: C[],
  changes: SessionChange[],
  date: string,
): ClassSession<C>[] {
  const dow = dayOfWeekOfDate(date);
  const byClass = new Map(classes.map((c) => [c.id, c]));
  const valid = changes.filter((ch) => {
    const c = byClass.get(ch.class_id);
    return !!c && dayOfWeekOfDate(ch.session_date) === c.day_of_week;
  });

  const out: ClassSession<C>[] = [];
  for (const c of classes) {
    if (c.day_of_week !== dow) continue;
    const ch = valid.find((x) => x.class_id === c.id && x.session_date === date) ?? null;
    if (!ch) {
      out.push({ classRow: c, date, startTime: c.start_time, status: "scheduled", change: null });
    } else if (ch.kind === "cancelled") {
      out.push({ classRow: c, date, startTime: c.start_time, status: "cancelled", change: ch });
    } else if (ch.new_date === date) {
      out.push({
        classRow: c,
        date,
        startTime: ch.new_start_time ?? c.start_time,
        status: "moved_in",
        change: ch,
      });
    } else {
      out.push({ classRow: c, date, startTime: c.start_time, status: "moved_away", change: ch });
    }
  }
  for (const ch of valid) {
    if (ch.kind !== "moved" || ch.new_date !== date || ch.session_date === date) continue;
    const c = byClass.get(ch.class_id);
    if (!c) continue;
    out.push({
      classRow: c,
      date,
      startTime: ch.new_start_time ?? c.start_time,
      status: "moved_in",
      change: ch,
    });
  }
  return out.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** The session of one class that runs on `date`, if any (at most one). */
export function runningSessionOn<C extends ClassLike>(
  classRow: C,
  changes: SessionChange[],
  date: string,
): ClassSession<C> | null {
  return sessionsOnDate([classRow], changes, date).find((s) => sessionRuns(s.status)) ?? null;
}

/** "Tue 4 Nov" for a YYYY-MM-DD date, zone-independent. */
export function formatSessionDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-IE", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

/** "7:00 PM" for "19:00[:00]". */
export function formatClassTime(time: string): string {
  const parts = time.split(":");
  const h = Number(parts[0] ?? 0);
  const m = parts[1] ?? "00";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

/** Short human description of a session's change, or null if unchanged. */
export function describeSessionChange(session: ClassSession): string | null {
  const ch = session.change;
  if (!ch) return null;
  if (session.status === "cancelled") return "Cancelled";
  if (session.status === "moved_away" && ch.new_date && ch.new_start_time) {
    return `Moved to ${formatSessionDate(ch.new_date)}, ${formatClassTime(ch.new_start_time)}`;
  }
  if (session.status === "moved_in") {
    return ch.session_date === session.date
      ? `Time changed (usually ${formatClassTime(session.classRow.start_time)})`
      : `Moved from ${formatSessionDate(ch.session_date)}`;
  }
  return null;
}
