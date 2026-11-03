import { parseISO, startOfMonth } from "date-fns";
import {
  billableMembers,
  isFrozenMonth,
  isOverdue,
  trailingMonthWindow,
  type MonthPeriod,
  type PaymentStatus,
} from "./overdue";
import { holdCovering, monthStartOf } from "./holds";

// Flow audit 6.4: an athlete's own monthly payment status, for athlete Home.
// Uses the same rules as the coach payments grid (isBillable, the gym's
// payments_tracked_from, Rule 8 overdue) so both sides always agree. Never
// takes or returns an amount (CLAUDE.md Rule 3): callers select only
// period_month, period_year and status.

export type AthleteMonthStatus = "paid" | "waived" | "frozen" | "overdue" | "due";

type HoldSpan = { start_month: string; end_month: string };

export type AthleteMonth = MonthPeriod & { status: AthleteMonthStatus };

export type AthletePaymentSummary =
  | { kind: "not_billable"; reason: "casual" | "staff" }
  | {
      kind: "billable";
      months: AthleteMonth[];
      overdue: AthleteMonth[];
      current: AthleteMonth | null;
      /** The hold covering today, else the next upcoming one (flow audit 2.4). */
      hold: (HoldSpan & { active: boolean }) | null;
    };

type MemberFields = {
  id: string;
  role: string;
  membership_plan: string;
  join_date: string;
};

type PaymentFields = { period_month: number; period_year: number; status: PaymentStatus };

export const ATHLETE_STATUS_WINDOW = 6;

/**
 * Known divergence: the coach grid, dashboard and assistant still take
 * "today" from the browser or server clock, so for up to an hour around a
 * month boundary (gym zone vs UTC) the two sides can disagree on whether last
 * month is overdue yet.
 *
 * `today` is the gym's calendar date (YYYY-MM-DD), so "this month" and
 * "overdue" follow the gym's zone rather than the server's.
 */
export function summariseAthletePayments(
  member: MemberFields,
  payments: PaymentFields[],
  paymentsTrackedFrom: string | null,
  today: string,
  holds: (HoldSpan & { member_id: string })[],
): AthletePaymentSummary {
  const [billable] = billableMembers([member], paymentsTrackedFrom, holds);
  if (!billable) {
    return {
      kind: "not_billable",
      reason: member.role === "athlete" ? "casual" : "staff",
    };
  }

  // Local midnight of the gym's date: isOverdue compares against month ends
  // built with local dates too.
  const now = parseISO(today);
  const startMonth = startOfMonth(parseISO(billable.join_date));
  const statusOf = new Map(payments.map((p) => [`${p.period_year}-${p.period_month}`, p.status]));

  const months: AthleteMonth[] = trailingMonthWindow(ATHLETE_STATUS_WINDOW, 0, now)
    .filter((p) => new Date(p.year, p.month - 1, 1) >= startMonth)
    .map((p) => {
      const stored = statusOf.get(`${p.year}-${p.month}`) ?? "unpaid";
      const status: AthleteMonthStatus =
        stored === "paid"
          ? "paid"
          : stored === "waived"
            ? "waived"
            : isFrozenMonth(billable, p)
              ? "frozen"
              : isOverdue(stored, p, now)
                ? "overdue"
                : "due";
      return { ...p, status };
    })
    .reverse(); // newest first

  const currentKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
  return {
    kind: "billable",
    months,
    overdue: months.filter((m) => m.status === "overdue"),
    current: months.find((m) => `${m.year}-${m.month}` === currentKey) ?? null,
    hold: currentOrNextHold(holds, today),
  };
}

function currentOrNextHold(holds: HoldSpan[], today: string) {
  const thisMonth = monthStartOf(today);
  const active = holdCovering(holds, today);
  if (active) return { start_month: active.start_month, end_month: active.end_month, active: true };
  const next = holds
    .filter((h) => h.start_month > thisMonth)
    .sort((a, b) => a.start_month.localeCompare(b.start_month))[0];
  return next ? { start_month: next.start_month, end_month: next.end_month, active: false } : null;
}
