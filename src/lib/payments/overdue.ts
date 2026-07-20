import { endOfMonth, startOfMonth, subMonths } from "date-fns";
import type { Database } from "@/types/database";

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

export type MemberForOverdue = { id: string; join_date: string };

export function periodKey(memberId: string, period: MonthPeriod): string {
  return `${memberId}-${period.month}-${period.year}`;
}

// A member has no applicable payment obligation for months before they
// joined — excluded from both the grid (rendered as "—") and this count.
export function getOverdueMemberIds(
  members: MemberForOverdue[],
  payments: PaymentRowForOverdue[],
  window: MonthPeriod[],
  now: Date = new Date(),
): Set<string> {
  const statusByKey = new Map(
    payments.map((p) => [
      periodKey(p.member_id, { month: p.period_month, year: p.period_year }),
      p.status,
    ]),
  );
  const overdue = new Set<string>();

  for (const member of members) {
    const joinMonth = startOfMonth(new Date(member.join_date));
    for (const period of window) {
      const periodStart = new Date(period.year, period.month - 1, 1);
      if (periodStart < joinMonth) continue;
      const status = statusByKey.get(periodKey(member.id, period)) ?? "unpaid";
      if (isOverdue(status, period, now)) {
        overdue.add(member.id);
        break;
      }
    }
  }

  return overdue;
}
