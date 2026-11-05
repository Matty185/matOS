import { addDaysToDate, gymWallClock } from "@matos/shared";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth/current-member";
import { getGymTimeZone } from "@/lib/time/gym-timezone";
import {
  attendanceByWeek,
  busiestClasses,
  lastMonths,
  membershipByMonth,
  revenueByMonth,
  trialFunnel,
} from "@/lib/reports/compute";
import { SimpleBarChart } from "@/components/shared/simple-bar-chart";

export const dynamic = "force-dynamic";

const WEEKS = 12;
const PAGE = 1000;

// PostgREST returns at most 1000 rows per request; page through so a busy
// gym's 12 weeks of check-ins aren't silently cut short.
async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const out: T[] = [];
  for (let start = 0; start < 50 * PAGE; start += PAGE) {
    const { data, error } = await page(start, start + PAGE - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { data: out, error: null };
}
const MONTHS = 6;

// Amounts are entered without a currency; the first gyms are in Ireland.
// Revisit with a per-gym currency setting.
const money = (n: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
const monthLabel = (ym: string) =>
  new Intl.DateTimeFormat("en-IE", { month: "short", year: "2-digit", timeZone: "UTC" }).format(
    new Date(`${ym}-01T00:00:00Z`),
  );
const dayLabel = (d: string) =>
  new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${d}T00:00:00Z`),
  );

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

// Flow audit 10.4 (attendance, busiest classes, growth/churn), 6.8 (money
// recorded as paid) and 9.2 (trial → member). Staff only (the (coach)
// layout); every query runs under staff RLS for the caller's gym.
export default async function ReportsPage() {
  const member = await getCurrentMember();
  if (!member) return null;
  const supabase = createClient();
  const timeZone = await getGymTimeZone(supabase, member.gymId);
  const today = gymWallClock(new Date(), timeZone).date;
  const from = addDaysToDate(today, -7 * WEEKS);
  const months = lastMonths(today, MONTHS);
  const monthsFrom = `${months[0]}-01`;
  const [y0, m0] = [Number(months[0]!.slice(0, 4)), Number(months[0]!.slice(5, 7))];

  const [attRes, classRes, memRes, eventRes, payRes, leadRes] = await Promise.all([
    allRows<{ class_id: string; checked_in_date: string; member_id: string }>((a, b) =>
      supabase
        .from("attendance")
        .select("class_id, checked_in_date, member_id")
        .gte("checked_in_date", from)
        .order("id")
        .range(a, b),
    ),
    supabase.from("classes").select("id, name"),
    supabase.from("members").select("id, join_date, active, role").neq("role", "guardian"),
    supabase
      .from("audit_log")
      .select("action, timestamp, entity_id")
      .in("action", ["member.deactivated", "member.reactivated"])
      .gte("timestamp", `${monthsFrom}T00:00:00Z`),
    allRows<{ period_month: number; period_year: number; status: string; amount: number | null }>(
      (a, b) =>
        supabase
          .from("payments")
          .select("period_month, period_year, status, amount")
          .gte("period_year", y0)
          .order("id")
          .range(a, b),
    ),
    supabase.from("trial_leads").select("status").gte("created_at", `${monthsFrom}T00:00:00Z`),
  ]);
  const failed = [attRes, classRes, memRes, eventRes, payRes, leadRes].some((r) => r.error);

  const att = attRes.data ?? [];
  const members = memRes.data ?? [];
  const athleteIds = new Set(members.filter((m) => m.role === "athlete").map((m) => m.id));
  const weeks = attendanceByWeek(
    att.map((a) => a.checked_in_date),
    today,
    WEEKS,
  );
  const lastFourWeeks = weeks.slice(-4).reduce((s, w) => s + w.count, 0);
  // Athletes' own check-ins only, so the per-athlete figure isn't inflated
  // by coaches training.
  const fourWeeksFrom = weeks[weeks.length - 4]?.start ?? today;
  const athleteVisits = att.filter(
    (a) => athleteIds.has(a.member_id) && a.checked_in_date >= fourWeeksFrom,
  ).length;
  const classes = busiestClasses(
    att.filter((a) => a.checked_in_date >= addDaysToDate(today, -56)),
    new Map((classRes.data ?? []).map((c) => [c.id, c.name])),
  ).slice(0, 8);

  const athletesActive = members.filter((m) => m.active && m.role === "athlete").length;
  const growth = membershipByMonth(
    members.filter((m) => m.role === "athlete").map((m) => m.join_date),
    // Athletes only (like "joined"), bucketed by the gym's calendar month.
    (eventRes.data ?? [])
      .filter((e) => e.entity_id && athleteIds.has(e.entity_id))
      .map((e) => ({
        action: e.action,
        timestamp: gymWallClock(new Date(e.timestamp), timeZone).date,
      })),
    months,
  );
  const joined = growth.reduce((s, g) => s + g.joined, 0);
  const left = growth.reduce((s, g) => s + g.left, 0);

  const revenue = revenueByMonth(
    (payRes.data ?? []).filter((p) => p.period_year * 12 + p.period_month >= y0 * 12 + m0),
    months,
  );
  const thisMonth = revenue[revenue.length - 1]!;
  const missingAmounts = revenue.reduce((s, r) => s + r.missingAmount, 0);

  const funnel = trialFunnel((leadRes.data ?? []).map((l) => l.status));
  const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl tracking-wide">Reports</h1>
        <p className="text-sm text-muted-foreground">
          How the academy is doing, from what&apos;s recorded in MatOS. Months are calendar months;
          the last one is still in progress.
        </p>
        {failed ? (
          <p className="text-sm text-destructive">
            Some figures couldn&apos;t be loaded and may show as zero. Try refreshing.
          </p>
        ) : null}
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="r-attendance">
        <h2 id="r-attendance" className="text-lg font-medium">
          Attendance
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile label="Check-ins, last 4 weeks" value={String(lastFourWeeks)} />
          <Tile label="Active athletes" value={String(athletesActive)} />
          <Tile
            label="Visits per athlete, last 4 weeks"
            value={athletesActive ? (athleteVisits / athletesActive).toFixed(1) : "—"}
          />
        </div>
        <SimpleBarChart
          title={`Check-ins per week, last ${WEEKS} weeks`}
          bars={weeks.map((w) => ({
            key: w.start,
            label: `Week of ${dayLabel(w.start)}`,
            value: w.count,
            display: `${w.count} check-in${w.count === 1 ? "" : "s"}`,
          }))}
        />
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Busiest classes, last 8 weeks</h3>
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No check-ins in the last 8 weeks.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {classes.map((c) => (
                <li key={c.id} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{c.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {c.average.toFixed(1)} on average when held · {c.sessions} session
                      {c.sessions === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted" aria-hidden>
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${(c.average / classes[0]!.average) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="r-members">
        <h2 id="r-members" className="text-lg font-medium">
          Members, last {MONTHS} months
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile label="Joined" value={String(joined)} hint="By join date" />
          <Tile label="Left" value={String(left)} hint="Deactivated in MatOS" />
          <Tile label="Net change" value={`${joined - left >= 0 ? "+" : ""}${joined - left}`} />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1.5 font-normal">Month</th>
              <th className="py-1.5 text-right font-normal">Joined</th>
              <th className="py-1.5 text-right font-normal">Left</th>
              <th className="py-1.5 text-right font-normal">Came back</th>
            </tr>
          </thead>
          <tbody>
            {growth.map((g) => (
              <tr key={g.month} className="border-b last:border-0">
                <td className="py-1.5">{monthLabel(g.month)}</td>
                <td className="py-1.5 text-right tabular-nums">{g.joined}</td>
                <td className="py-1.5 text-right tabular-nums">{g.left}</td>
                <td className="py-1.5 text-right tabular-nums">{g.returned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="r-money">
        <h2 id="r-money" className="text-lg font-medium">
          Payments recorded
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Tile
            label={`Paid for ${monthLabel(thisMonth.month)} so far`}
            value={money(thisMonth.paid)}
            hint={`${thisMonth.payments} payment${thisMonth.payments === 1 ? "" : "s"}`}
          />
          <Tile
            label={`Last ${MONTHS} months`}
            value={money(revenue.reduce((s, r) => s + r.paid, 0))}
          />
        </div>
        <SimpleBarChart
          title="Paid per membership month"
          bars={revenue.map((r) => ({
            key: r.month,
            label: monthLabel(r.month),
            value: r.paid,
            display: `${money(r.paid)} (${r.payments} payment${r.payments === 1 ? "" : "s"})`,
          }))}
        />
        <p className="text-xs text-muted-foreground">
          Totals of amounts entered when payments were recorded, by the month they cover.
          {missingAmounts > 0
            ? ` ${missingAmounts} paid month${missingAmounts === 1 ? " was" : "s were"} recorded without an amount and aren't counted.`
            : ""}
        </p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="r-trials">
        <h2 id="r-trials" className="text-lg font-medium">
          Free trials, last {MONTHS} months
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Tile label="Requests" value={String(funnel.requests)} />
          <Tile label="Contacted" value={String(funnel.contacted)} />
          <Tile label="Trial booked" value={String(funnel.booked)} />
          <Tile label="Came to trial" value={String(funnel.attended)} />
          <Tile
            label="Joined"
            value={String(funnel.joined)}
            hint={`${pct(funnel.conversion)} of requests`}
          />
        </div>
        {funnel.notInterested > 0 ? (
          <p className="text-xs text-muted-foreground">
            {funnel.notInterested} marked not interested.
          </p>
        ) : null}
      </section>
    </div>
  );
}
