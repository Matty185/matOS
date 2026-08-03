import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Activity, AlertTriangle, CalendarPlus, CreditCard, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { trailingMonthWindow, getOverdueMemberIds } from "@/lib/payments/overdue";
import { resolveAuditNames, describeAuditEntry, type AuditLogRow } from "@/lib/audit/format";

const WINDOW_LENGTH = 6;
const NOT_SEEN_DAYS = 30;
const RECENT_ACTIVITY_LIMIT = 10;

async function getDashboardData() {
  const supabase = createClient();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const [
    { data: members, error: membersError },
    { data: allClasses, error: classesError },
    { count: checkInsToday, error: checkInsError },
    { data: recentAudit, error: auditError },
  ] = await Promise.all([
    supabase
      .from("members")
      .select("id, first_name, last_name, join_date, role")
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

  const overdueIds = getOverdueMemberIds(activeMembers, payments ?? [], monthWindow);
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

  return {
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
    { label: "Mark attendance", href: "/attendance", icon: CalendarPlus },
    { label: "Record payment", href: "/payments", icon: CreditCard },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Dashboard</h1>

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
