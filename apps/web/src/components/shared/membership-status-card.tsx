import { CheckCircle2, CircleAlert, Clock, MinusCircle, PauseCircle, Wallet } from "lucide-react";
import { describeHold } from "@/lib/payments/holds";
import type { AthleteMonthStatus, AthletePaymentSummary } from "@/lib/payments/athlete-status";

const PLAN_LABELS: Record<string, string> = {
  monthly: "Monthly",
  comp_team: "Comp team",
  casual: "Casual",
};

const STATUS: Record<
  AthleteMonthStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  paid: { label: "Paid", icon: CheckCircle2, className: "text-green-700 dark:text-green-400" },
  waived: { label: "Waived", icon: MinusCircle, className: "text-muted-foreground" },
  frozen: { label: "Frozen", icon: PauseCircle, className: "text-muted-foreground" },
  overdue: { label: "Overdue", icon: CircleAlert, className: "text-destructive" },
  // "Unpaid", the coach grid's word for the same state.
  due: { label: "Unpaid", icon: Clock, className: "text-amber-700 dark:text-amber-400" },
};

const monthName = (month: number, year: number, withYear = false) =>
  new Intl.DateTimeFormat("en-IE", {
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Flow audit 6.4: the athlete's own membership fee status. Amounts are never
// shown (CLAUDE.md Rule 3) — just paid / waived / overdue / due per month.
export function MembershipStatusCard({
  plan,
  summary,
  childName,
}: {
  plan: string;
  summary: AthletePaymentSummary;
  /** A parent viewing a child's card (flow audit 8.2): "Saoirse's" not "Your". */
  childName?: string;
}) {
  const whose = childName ? `${childName}'s` : "Your";
  const upToDate = childName ? "All up to date." : "You're all up to date.";
  const planLabel = PLAN_LABELS[plan] ?? plan;

  if (summary.kind === "not_billable") {
    return (
      <section
        className="flex items-start gap-3 rounded-md border p-4"
        aria-labelledby="membership-heading"
      >
        <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 id="membership-heading" className="font-medium">
            Membership · {planLabel}
          </h2>
          <p className="text-sm text-muted-foreground">
            {summary.reason === "casual"
              ? "You pay per class, so there's no monthly fee to track here."
              : "Staff don't pay a monthly fee."}
          </p>
        </div>
      </section>
    );
  }

  const { months, overdue, current, hold } = summary;
  // Year only on months from an earlier year than the newest one shown.
  const newestYear = months[0]?.year;
  const headline =
    overdue.length > 0
      ? overdue.length > 3
        ? `Overdue for ${overdue.length} months, since ${monthName(overdue[overdue.length - 1]!.month, overdue[overdue.length - 1]!.year, true)}. Please talk to your coach.`
        : `Overdue for ${joinNames(overdue.map((m) => monthName(m.month, m.year)))}. Please talk to your coach.`
      : hold?.active
        ? `${whose} membership is on hold (${describeHold(hold)}). No fee is due for those months.`
        : current?.status === "paid"
          ? `Paid for ${monthName(current.month, current.year)}. ${upToDate}`
          : current?.status === "waived"
            ? `${monthName(current.month, current.year)} is waived. ${upToDate}`
            : current
              ? `${monthName(current.month, current.year)} isn't paid yet.`
              : upToDate;

  return (
    <section
      className={`flex flex-col gap-3 rounded-md border p-4 ${overdue.length > 0 ? "border-destructive/50" : ""}`}
      aria-labelledby="membership-heading"
    >
      <div className="flex items-start gap-3">
        <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 id="membership-heading" className="font-medium">
            Membership · {planLabel}
          </h2>
          <p
            className={`text-sm ${overdue.length > 0 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {headline}
          </p>
          {hold && !hold.active ? (
            <p className="text-sm text-muted-foreground">
              On hold {describeHold(hold)}. No fee is due for those months.
            </p>
          ) : null}
        </div>
      </div>
      {months.length > 0 ? (
        <ul
          className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3"
          aria-label="Recent months"
        >
          {months.map((m) => {
            const s = STATUS[m.status];
            const Icon = s.icon;
            return (
              <li
                key={`${m.year}-${m.month}`}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>{monthName(m.month, m.year, m.year !== newestYear)}</span>
                <span className={`inline-flex items-center gap-1 font-medium ${s.className}`}>
                  <Icon className="h-4 w-4" aria-hidden />
                  {s.label}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Payments are recorded by your gym. If something looks wrong, ask your coach.
      </p>
    </section>
  );
}
