import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Award,
  Activity,
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  Circle,
  CreditCard,
  UserPlus,
} from "lucide-react";
import {
  computeReadiness,
  formatClassTime,
  gymWallClock,
  sessionRuns,
  sessionsOnDate,
} from "@matos/shared";
import { fetchSessionChanges } from "@/lib/classes/session-changes";
import { fetchPromotionProgress, fetchPromotionRule } from "@/lib/promotions/readiness";
import { createClient } from "@/lib/supabase/server";
import { DismissSetupButton } from "@/components/shared/dismiss-setup-button";
import { getCurrentMember } from "@/lib/auth/current-member";
import { getGymTimeZone } from "@/lib/time/gym-timezone";
import { trailingMonthWindow, getOverdueMemberIds, billableMembers } from "@/lib/payments/overdue";
import { fetchHoldsForWindow } from "@/lib/payments/holds";
import { getPaymentsTrackedFrom } from "@/lib/payments/tracked-from";
import { fetchLiveAnnouncements } from "@/lib/announcements/fetch";
import { AnnouncementCard, type AnnouncementView } from "@/components/shared/announcement-card";
import { resolveAuditNames, describeAuditEntry, type AuditLogRow } from "@/lib/audit/format";

const WINDOW_LENGTH = 6;
const NOT_SEEN_DAYS = 30;
const RECENT_ACTIVITY_LIMIT = 10;

async function getDashboardData() {
  const supabase = createClient();
  const today = new Date();
  // Gym-zone date (Stage O1) — attendance.checked_in_date is derived in the
  // gym's timezone, so "today" must be too.
  const member = await getCurrentMember();
  const timeZone = member ? await getGymTimeZone(supabase, member.gymId) : undefined;
  const todayStr = timeZone ? gymWallClock(today, timeZone).date : today.toISOString().slice(0, 10);

  const [
    { data: members, error: membersError },
    { data: allClasses, error: classesError },
    { count: checkInsToday, error: checkInsError },
    { data: recentAudit, error: auditError },
  ] = await Promise.all([
    supabase
      .from("members")
      .select(
        "id, first_name, last_name, email, join_date, role, membership_plan, user_id, belt, stripes",
      )
      .eq("active", true),
    supabase.from("classes").select("id").eq("active", true),
    supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("checked_in_date", todayStr),
    supabase
      .from("audit_log")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(RECENT_ACTIVITY_LIMIT),
  ]);
  if (membersError) throw membersError;
  if (classesError) throw classesError;
  if (checkInsError) throw checkInsError;
  if (auditError) throw auditError;

  const activeMembers = members ?? [];

  const monthWindow = trailingMonthWindow(WINDOW_LENGTH);
  const minYear = monthWindow[0]!.year;
  const maxYear = monthWindow[WINDOW_LENGTH - 1]!.year;
  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("member_id, period_month, period_year, status")
    .gte("period_year", minYear)
    .lte("period_year", maxYear);
  if (paymentsError) throw paymentsError;

  const overdueIds = getOverdueMemberIds(
    billableMembers(
      activeMembers,
      await getPaymentsTrackedFrom(supabase),
      await fetchHoldsForWindow(supabase, monthWindow),
    ),
    payments ?? [],
    monthWindow,
  );
  const overdueMembers = activeMembers.filter((m) => overdueIds.has(m.id));

  // "Not seen 30+ days" per plan §7's dashboard flags. checked_in_at is
  // trigger-derived and this is a small, bounded (alpha-scale) dataset, so
  // fetching every active member's attendance and reducing to a last-seen
  // date in JS matches the same approach overdue.ts already uses rather
  // than needing a GROUP BY MAX view.
  const { data: attendanceRows, error: attendanceError } = await supabase
    .from("attendance")
    .select("member_id, checked_in_at")
    .in(
      "member_id",
      activeMembers.map((m) => m.id),
    );
  if (attendanceError) throw attendanceError;

  const lastSeenByMember = new Map<string, string>();
  for (const row of attendanceRows ?? []) {
    const existing = lastSeenByMember.get(row.member_id);
    if (!existing || row.checked_in_at > existing) {
      lastSeenByMember.set(row.member_id, row.checked_in_at);
    }
  }
  const notSeenCutoff = new Date(today);
  notSeenCutoff.setDate(notSeenCutoff.getDate() - NOT_SEEN_DAYS);
  // Athletes only — a coach/owner not personally training isn't a
  // retention risk the way an athlete going quiet is, and staff naturally
  // have no attendance rows at all (they're never seeded/marked present),
  // which would otherwise flag every coach and owner unconditionally.
  const notSeenMembers = activeMembers.filter((m) => {
    if (m.role !== "athlete") return false;
    if (new Date(m.join_date) > notSeenCutoff) return false; // too new to flag yet
    const lastSeen = lastSeenByMember.get(m.id);
    return !lastSeen || new Date(lastSeen) < notSeenCutoff;
  });

  const auditRows = (recentAudit ?? []) as AuditLogRow[];
  const names = await resolveAuditNames(supabase, auditRows);
  const recentActivity = auditRows.map((row) => ({
    id: row.id,
    description: describeAuditEntry(row, names),
  }));

  // Stage O4: setup checklist, shown to owners until the gym's onboarding
  // is marked complete (in /setup, or once everything below is done).
  let setup: { label: string; done: boolean; href: string }[] | null = null;
  if (member?.role === "gym_owner") {
    const { data: gymRow } = await supabase
      .from("gyms")
      .select("onboarding_completed_at, address, contact_email")
      .eq("id", member.gymId)
      .single();
    if (gymRow && !gymRow.onboarding_completed_at) {
      const athletes = activeMembers.filter((m) => m.role === "athlete");
      // Roster-only members (no email, e.g. kids) can't sign up, so they
      // don't count towards "half signed up".
      const canSignUp = athletes.filter((m) => m.email || m.user_id);
      const joined = canSignUp.filter((m) => m.user_id).length;
      setup = [
        {
          label: "Add your gym's details",
          done: Boolean(gymRow.address || gymRow.contact_email),
          href: "/settings",
        },
        {
          label: "Set up your timetable",
          done: (allClasses ?? []).length > 0,
          href: "/setup?step=timetable",
        },
        {
          label: "Add your coaches",
          done: activeMembers.some((m) => m.role === "coach"),
          href: "/setup?step=team",
        },
        { label: "Import your members", done: athletes.length > 0, href: "/members/import" },
        {
          label: "Get half your members signed up",
          done: athletes.length > 0 && joined * 2 >= canSignUp.length,
          href: "/members?invite=not_invited",
        },
      ];
      // Everything done → setup is complete; stop showing the card and
      // stop routing "/" to the wizard (plan §3.3: "disappears
      // automatically"). Owner-only update, allowed by gyms_update_owner.
      if (setup.every((s) => s.done)) {
        await supabase
          .from("gyms")
          .update({ onboarding_completed_at: new Date().toISOString() })
          .eq("id", member.gymId)
          .is("onboarding_completed_at", null);
        setup = null;
      }
    }
  }

  // Flow audit 5.3: how many are due a promotion (guidance).
  const [rule, progress] = await Promise.all([
    fetchPromotionRule(supabase),
    fetchPromotionProgress(supabase).catch(() => new Map()),
  ]);
  const readyForPromotion = activeMembers.filter((m) => {
    const p = progress.get(m.id);
    return (
      p !== undefined &&
      computeReadiness({
        belt: m.belt,
        stripes: m.stripes,
        lastPromotedAt: p.lastPromotedAt,
        lastIsInitial: p.lastIsInitial,
        classesSince: p.classesSince,
        rule,
        now: today,
      }).status === "ready"
    );
  }).length;

  // Flow audit 3.3: the signed-in coach's own classes today (one-off
  // changes applied). Degrades to none if anything can't be read.
  let teachingToday: { id: string; name: string; startTime: string }[] = [];
  if (member) {
    try {
      const { data: mine } = await supabase
        .from("classes")
        .select("*")
        .eq("active", true)
        .eq("coach_member_id", member.memberId);
      if (mine && mine.length > 0) {
        const changes = await fetchSessionChanges(supabase, todayStr, todayStr);
        teachingToday = sessionsOnDate(mine, changes, todayStr)
          .filter((s) => sessionRuns(s.status))
          .map((s) => ({ id: s.classRow.id, name: s.classRow.name, startTime: s.startTime }));
      }
    } catch {
      console.error("[dashboard] couldn't load the coach's classes");
    }
  }

  // Flow audit 7.1: what members currently see on Home.
  let announcements: AnnouncementView[] = [];
  try {
    announcements = await fetchLiveAnnouncements(supabase, todayStr);
  } catch {
    console.error("[dashboard] couldn't load announcements");
  }

  return {
    setup,
    announcements,
    todayStr,
    readyForPromotion,
    teachingToday,
    activeMemberCount: activeMembers.length,
    classesThisWeekCount: (allClasses ?? []).length,
    checkInsToday: checkInsToday ?? 0,
    overdueCount: overdueIds.size,
    overdueMembers,
    notSeenMembers,
    recentActivity,
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  const statCards = [
    { label: "Active members", value: String(data.activeMemberCount) },
    { label: "Classes this week", value: String(data.classesThisWeekCount) },
    { label: "Overdue payments", value: String(data.overdueCount) },
    { label: "Today's check-ins", value: String(data.checkInsToday) },
  ];

  const quickActions = [
    { label: "Add member", href: "/members/new", icon: UserPlus },
    { label: "Import members", href: "/members/import", icon: UserPlus },
    { label: "Mark attendance", href: "/attendance", icon: CalendarPlus },
    { label: "Record payment", href: "/payments", icon: CreditCard },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Dashboard</h1>

      {data.teachingToday.length > 0 ? (
        <section
          className="flex flex-col gap-2 rounded-md border p-4"
          aria-labelledby="teaching-heading"
        >
          <h2 id="teaching-heading" className="text-lg font-medium">
            You&apos;re teaching today
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {data.teachingToday.map((c) => (
              <li key={c.id}>
                {formatClassTime(c.startTime)} · {c.name}
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" className="h-11 self-start">
            <Link href="/attendance">Take attendance</Link>
          </Button>
        </section>
      ) : null}

      {data.announcements.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="dash-announcements-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="dash-announcements-heading" className="text-lg font-medium">
              Announcements members can see
            </h2>
            <Button asChild variant="outline" className="h-11">
              <Link href="/announcements">Manage</Link>
            </Button>
          </div>
          {data.announcements.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} today={data.todayStr} />
          ))}
        </section>
      ) : null}

      {data.setup ? (
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg">
              Finish setting up your gym
              <span className="text-sm font-normal text-muted-foreground">
                {data.setup.filter((s) => s.done).length} of {data.setup.length} done
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col">
              {data.setup.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="flex min-h-11 items-center gap-3 rounded-md px-2 text-sm hover:bg-accent"
                  >
                    {item.done ? (
                      <CheckCircle2
                        className="h-5 w-5 shrink-0 text-green-600"
                        aria-hidden="true"
                      />
                    ) : (
                      <Circle
                        className="h-5 w-5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <span className={item.done ? "text-muted-foreground line-through" : ""}>
                      {item.label}
                    </span>
                    <span className="sr-only">{item.done ? "(done)" : "(to do)"}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button asChild className="h-11">
                <Link href="/setup">Open setup guide</Link>
              </Button>
              <DismissSetupButton />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {quickActions.map((action) => (
          <Button key={action.href} asChild variant="outline" className="h-11">
            <Link href={action.href}>
              <action.icon className="mr-2 h-4 w-4" />
              {action.label}
            </Link>
          </Button>
        ))}
      </div>

      {data.readyForPromotion > 0 ? (
        <Link
          href="/promotions"
          className="flex min-h-11 items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm hover:bg-primary/10"
        >
          <Award className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-medium">{data.readyForPromotion}</span>{" "}
            {data.readyForPromotion === 1 ? "member is" : "members are"} ready for promotion. Review
            →
          </span>
        </Link>
      ) : null}

      {data.overdueMembers.length > 0 || data.notSeenMembers.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Flags</h2>
          <ul className="flex flex-col gap-2">
            {data.overdueMembers.map((m) => (
              <li
                key={`overdue-${m.id}`}
                className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                <span>
                  <Link href={`/members/${m.id}`} className="font-medium hover:underline">
                    {m.first_name} {m.last_name}
                  </Link>{" "}
                  has an overdue payment.
                </span>
              </li>
            ))}
            {data.notSeenMembers.map((m) => (
              <li
                key={`not-seen-${m.id}`}
                className="flex items-center gap-2 rounded-md border p-3 text-sm"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  <Link href={`/members/${m.id}`} className="font-medium hover:underline">
                    {m.first_name} {m.last_name}
                  </Link>{" "}
                  hasn&apos;t been seen in {NOT_SEEN_DAYS}+ days.
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Recent activity</h2>
        {data.recentActivity.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No recent activity yet"
            description="Actions you and your coaches take will show up here."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {data.recentActivity.map((entry) => (
              <li key={entry.id} className="rounded-md border p-3 text-sm">
                {entry.description}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
