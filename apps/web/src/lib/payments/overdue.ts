import { endOfMonth, parseISO, startOfMonth, subMonths } from "date-fns";
import type { Database } from "@matos/shared";
import { frozenMonthsByMember, monthKeyOf, type HoldRow } from "./holds";

export type PaymentStatus = Database["public"]["Enums"]["payment_status"];

export type MonthPeriod = { month: number; year: number };

// CLAUDE.md Rule 8: "Overdue is computed at query time, never stored:
// status = unpaid AND period end < today. No grace period." A period with
// no payments row at all is implicitly 'unpaid' — the caller is expected to
// pass "unpaid" as the default status when no row exists for a period.
export function isOverdue(
  status: PaymentStatus,
  period: MonthPeriod,
  now: Date = new Date(),
): boolean {
  if (status !== "unpaid") return false;
  return now > endOfMonth(new Date(period.year, period.month - 1, 1));
}

// Trailing N-month window ending at (and including) the current month —
// bounded and cheap to query, rather than scanning a member's full history
// since join. Matches the payments grid's own window so the dashboard
// "overdue" count and the grid's "overdue only" filter agree with each
// other. `monthsBack` shifts the whole window further into the past.
export function trailingMonthWindow(
  length: number,
  monthsBack = 0,
  now: Date = new Date(),
): MonthPeriod[] {
  const anchor = subMonths(now, monthsBack);
  return Array.from({ length }, (_, i) => {
    const d = subMonths(anchor, length - 1 - i);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  });
}

// CLAUDE.md Rule 3: payment `amount` visibility to athletes is deliberately
// two-layer — RLS (payments_select_self) is the first, but it lets an
// athlete's own row through including `amount`, by design (row ownership,
// not column redaction, is what RLS expresses). This mapper is the second,
// application-layer, strip step for any *future* athlete-facing payments
// screen. No such screen exists yet (Stage 8's athlete portal has no
// payments view — confirmed in Stage 11 review), so nothing calls this
// today; it exists now, ahead of that screen, specifically so the first PR
// that adds one reaches for this instead of a plain `select("*")` copy-
// pasted from the coach-side grid, which would leak `amount` with no
// warning since RLS alone wouldn't stop it.
export function toAthleteSafePayment<T extends { amount: number | null }>(
  payment: T,
): Omit<T, "amount"> {
  const copy: Partial<T> = { ...payment };
  delete copy.amount;
  return copy as Omit<T, "amount">;
}

export type PaymentRowForOverdue = {
  member_id: string;
  period_month: number;
  period_year: number;
  status: PaymentStatus;
};

// `frozen`: months ("2026-12") the member is on hold (flow audit 2.4),
// attached by billableMembers. A frozen month is never owed.
export type MemberForOverdue = { id: string; join_date: string; frozen?: ReadonlySet<string> };

export function periodKey(memberId: string, period: MonthPeriod): string {
  return `${memberId}-${period.month}-${period.year}`;
}

function buildStatusByKey(payments: PaymentRowForOverdue[]): Map<string, PaymentStatus> {
  return new Map(
    payments.map((p) => [
      periodKey(p.member_id, { month: p.period_month, year: p.period_year }),
      p.status,
    ]),
  );
}

// A member has no applicable payment obligation for months before they
// joined — excluded from both the grid (rendered as "—") and any overdue
// computation. Single source of truth for "which periods, in this window,
// is this member actually overdue for" — getOverdueMemberIds and the
// agent's get_overdue_payments tool both need this exact list (the latter
// independently reimplemented it without the join-date filter, which is
// how a member who joined 2 months ago got reported as "5 months
// overdue": every pre-join month in the 6-month window has no payment
// row, defaults to 'unpaid', and its period has already ended — so
// without this filter every one of them reads as overdue too).
export function getOverduePeriodsForMember(
  member: MemberForOverdue,
  statusByKey: Map<string, PaymentStatus>,
  window: MonthPeriod[],
  now: Date = new Date(),
): MonthPeriod[] {
  // parseISO reads "YYYY-MM-DD" as a local date; new Date() would read it
  // as UTC midnight and land in the previous month west of UTC.
  const joinMonth = startOfMonth(parseISO(member.join_date));
  return window.filter((period) => {
    const periodStart = new Date(period.year, period.month - 1, 1);
    if (periodStart < joinMonth) return false;
    if (isFrozenMonth(member, period)) return false;
    const status = statusByKey.get(periodKey(member.id, period)) ?? "unpaid";
    return isOverdue(status, period, now);
  });
}

export function getOverdueMemberIds(
  members: MemberForOverdue[],
  payments: PaymentRowForOverdue[],
  window: MonthPeriod[],
  now: Date = new Date(),
): Set<string> {
  const statusByKey = buildStatusByKey(payments);
  const overdue = new Set<string>();

  for (const member of members) {
    if (getOverduePeriodsForMember(member, statusByKey, window, now).length > 0) {
      overdue.add(member.id);
    }
  }

  return overdue;
}

type BillingFields = { role: string; membership_plan: string };

/**
 * Who owes a monthly fee (2026-11-02, confirmed with the gym): athletes on
 * the monthly or comp-team plan. Owners and coaches train free; casual
 * members pay per class, so they never owe a month. Every payments surface
 * goes through this, so they can't disagree.
 */
export function isBillable(member: BillingFields): boolean {
  return member.role === "athlete" && member.membership_plan !== "casual";
}

/**
 * Stage O6: the members whose payment obligations are actually computed.
 * - Only billable members (see isBillable) — not staff, not casual.
 * - Each member's obligation starts at the later of their join date and
 *   the gym's `payments_tracked_from` (the month MatOS started tracking
 *   this gym's payments). Without this, a freshly onboarded gym whose
 *   members joined years ago reads as entirely overdue on day one, because
 *   no pre-MatOS payment history exists. NULL tracked-from = no clamp.
 * Callers pass the result anywhere they'd pass members to the overdue
 * helpers or render the payments grid, so every surface agrees.
 */
export function billableMembers<T extends MemberForOverdue & BillingFields>(
  members: T[],
  paymentsTrackedFrom: string | null | undefined,
  // Required, not optional: every caller must load holds (flow audit 2.4),
  // or a frozen member would read as overdue on that surface.
  holds: HoldRow[],
): T[] {
  const frozen = frozenMonthsByMember(holds);
  return members.filter(isBillable).map((m) => ({
    ...m,
    join_date:
      paymentsTrackedFrom && m.join_date < paymentsTrackedFrom ? paymentsTrackedFrom : m.join_date,
    frozen: frozen.get(m.id) ?? new Set<string>(),
  }));
}

/** True when the member is on hold for that month (flow audit 2.4). */
export function isFrozenMonth(member: MemberForOverdue, period: MonthPeriod): boolean {
  return member.frozen?.has(monthKeyOf(period)) ?? false;
}
