import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@matos/shared";
import type { MonthPeriod } from "./overdue";

// Flow audit 2.4: membership holds (whole months). A frozen month is never
// owed; see billableMembers / getOverduePeriodsForMember in ./overdue, which
// every payments surface goes through.

export type HoldRow = { member_id: string; start_month: string; end_month: string };

/** "2026-12-01" → { year: 2026, month: 12 }. */
function toPeriod(firstOfMonth: string): MonthPeriod {
  return { year: Number(firstOfMonth.slice(0, 4)), month: Number(firstOfMonth.slice(5, 7)) };
}

/** Key for one month, independent of member: "2026-12". */
export function monthKeyOf(period: MonthPeriod): string {
  return `${period.year}-${String(period.month).padStart(2, "0")}`;
}

/** Every month a hold covers, as monthKeyOf keys (at most 12). */
export function holdMonths(hold: { start_month: string; end_month: string }): string[] {
  const out: string[] = [];
  let { year, month } = toPeriod(hold.start_month);
  const end = toPeriod(hold.end_month);
  // The DB caps a hold at 12 months; the bound here just guards bad input.
  for (let i = 0; i < 24 && (year < end.year || (year === end.year && month <= end.month)); i++) {
    out.push(monthKeyOf({ year, month }));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

/** member id → the months they're frozen. */
export function frozenMonthsByMember(holds: HoldRow[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const h of holds) {
    const set = map.get(h.member_id) ?? new Set<string>();
    for (const k of holdMonths(h)) set.add(k);
    map.set(h.member_id, set);
  }
  return map;
}

/** First of the month for a gym calendar date ("2026-11-03" → "2026-11-01"). */
export function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** The hold (if any) covering the month of `date` (gym calendar date). */
export function holdCovering<T extends { start_month: string; end_month: string }>(
  holds: T[],
  date: string,
): T | null {
  const m = monthStartOf(date);
  return holds.find((h) => h.start_month <= m && h.end_month >= m) ?? null;
}

/**
 * The gym's holds overlapping a month window (RLS: staff see their gym's,
 * an athlete only their own). Throws on error: callers must not compute
 * overdue without them, or a frozen member would read as overdue.
 */
export async function fetchHoldsForWindow(
  supabase: SupabaseClient<Database>,
  window: MonthPeriod[],
): Promise<HoldRow[]> {
  const first = window[0];
  const last = window[window.length - 1];
  if (!first || !last) return [];
  const from = `${monthKeyOf(first)}-01`;
  const to = `${monthKeyOf(last)}-01`;
  const { data, error } = await supabase
    .from("membership_holds")
    .select("member_id, start_month, end_month")
    .lte("start_month", to)
    .gte("end_month", from);
  if (error) throw error;
  return data ?? [];
}

/** Holds covering a given month (for "On hold" badges). */
export async function fetchHoldsCoveringDate(
  supabase: SupabaseClient<Database>,
  date: string,
): Promise<HoldRow[]> {
  const m = monthStartOf(date);
  const { data, error } = await supabase
    .from("membership_holds")
    .select("member_id, start_month, end_month")
    .lte("start_month", m)
    .gte("end_month", m);
  if (error) throw error;
  return data ?? [];
}

/** "December 2026" / "December 2026 – January 2027". */
export function describeHold(hold: { start_month: string; end_month: string }): string {
  const fmt = (d: string) =>
    new Intl.DateTimeFormat("en-IE", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${d}T00:00:00Z`),
    );
  return hold.start_month === hold.end_month
    ? fmt(hold.start_month)
    : `${fmt(hold.start_month)} – ${fmt(hold.end_month)}`;
}
