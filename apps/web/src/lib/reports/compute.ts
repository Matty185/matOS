import { addDaysToDate, dayOfWeekOfDate } from "@matos/shared";

// Flow audit 10.4 / 6.8 / 9.2: the gym's reports, computed from data that
// already exists (attendance, members, audit log, payments, trial requests).
// Pure functions; the page feeds them rows read under staff RLS.

/** Monday of the week containing `date` (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const dow = dayOfWeekOfDate(date); // 0 = Sunday
  return addDaysToDate(date, -((dow + 6) % 7));
}

/** Check-ins per week for the `weeks` weeks ending with the current one. */
export function attendanceByWeek(dates: string[], today: string, weeks = 12) {
  const thisWeek = weekStart(today);
  const starts = Array.from({ length: weeks }, (_, i) =>
    addDaysToDate(thisWeek, -7 * (weeks - 1 - i)),
  );
  const counts = new Map(starts.map((s) => [s, 0]));
  for (const d of dates) {
    const w = weekStart(d);
    if (counts.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return starts.map((start) => ({ start, count: counts.get(start) ?? 0 }));
}

/**
 * Average turnout per session for each class over the window: check-ins
 * divided by the number of dates the class had anyone in. Classes nobody
 * attended are left out. Busiest first.
 */
export function busiestClasses(
  rows: { class_id: string; checked_in_date: string }[],
  names: Map<string, string>,
) {
  const byClass = new Map<string, { total: number; dates: Set<string> }>();
  for (const r of rows) {
    const e = byClass.get(r.class_id) ?? { total: 0, dates: new Set<string>() };
    e.total += 1;
    e.dates.add(r.checked_in_date);
    byClass.set(r.class_id, e);
  }
  return Array.from(byClass.entries())
    .map(([id, e]) => ({
      id,
      name: names.get(id) ?? "Removed class",
      sessions: e.dates.size,
      total: e.total,
      average: e.total / e.dates.size,
    }))
    .sort((a, b) => b.average - a.average);
}

/** The `months` calendar months ending with today's, as "YYYY-MM". */
export function lastMonths(today: string, months = 6): string[] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return Array.from({ length: months }, (_, i) => {
    const idx = y * 12 + (m - 1) - (months - 1 - i);
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
  });
}

/** Members who joined, left (deactivated) and came back, per month. */
export function membershipByMonth(
  joinDates: string[],
  events: { action: string; timestamp: string }[],
  months: string[],
) {
  const out = new Map(months.map((m) => [m, { joined: 0, left: 0, returned: 0 }]));
  for (const d of joinDates) {
    const e = out.get(d.slice(0, 7));
    if (e) e.joined += 1;
  }
  for (const ev of events) {
    const e = out.get(ev.timestamp.slice(0, 7));
    if (!e) continue;
    if (ev.action === "member.deactivated") e.left += 1;
    if (ev.action === "member.reactivated") e.returned += 1;
  }
  return months.map((m) => ({ month: m, ...out.get(m)! }));
}

/** Money recorded as paid per period month (amounts as entered). */
export function revenueByMonth(
  payments: { period_month: number; period_year: number; status: string; amount: number | null }[],
  months: string[],
) {
  const out = new Map(months.map((m) => [m, { paid: 0, payments: 0, missingAmount: 0 }]));
  for (const p of payments) {
    if (p.status !== "paid") continue;
    const key = `${p.period_year}-${String(p.period_month).padStart(2, "0")}`;
    const e = out.get(key);
    if (!e) continue;
    e.payments += 1;
    if (p.amount === null) e.missingAmount += 1;
    else e.paid += Number(p.amount);
  }
  return months.map((m) => ({ month: m, ...out.get(m)! }));
}

/**
 * Trial funnel: of the requests made in the window, how many got each far.
 * Statuses run new → contacted → booked → attended → converted, so a later
 * status counts for every earlier step. "Not interested" counts as reached
 * no further than where it stopped (unknown), i.e. requested only.
 */
export function trialFunnel(statuses: string[]) {
  const rank: Record<string, number> = {
    new: 0,
    contacted: 1,
    booked: 2,
    attended: 3,
    converted: 4,
  };
  const reached = (n: number) => statuses.filter((s) => (rank[s] ?? 0) >= n).length;
  const requests = statuses.length;
  const joined = reached(4);
  return {
    requests,
    contacted: reached(1),
    booked: reached(2),
    attended: reached(3),
    joined,
    notInterested: statuses.filter((s) => s === "not_interested").length,
    conversion: requests > 0 ? joined / requests : null,
  };
}
