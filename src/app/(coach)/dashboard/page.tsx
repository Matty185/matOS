import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Activity } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { trailingMonthWindow, getOverdueMemberIds } from "@/lib/payments/overdue";

const WINDOW_LENGTH = 6;

// "Active members" and "Classes this week"/"Today's check-ins" remain
// unwired placeholders — Stage 6 only owns the payments-sourced card here
// (per this file's original stage-attribution comment: members/Stage 4,
// attendance/Stage 5, payments/Stage 6, agent audit log/Stage 7). Wiring
// the other three isn't part of the Payments module and is left for a
// dedicated dashboard pass so this stage's diff stays scoped to payments.
async function getOverdueCount() {
  const supabase = createClient();
  const monthWindow = trailingMonthWindow(WINDOW_LENGTH);
  const minYear = monthWindow[0]!.year;
  const maxYear = monthWindow[WINDOW_LENGTH - 1]!.year;

  const [{ data: members, error: membersError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase.from("members").select("id, join_date").eq("active", true),
      supabase
        .from("payments")
        .select("member_id, period_month, period_year, status")
        .gte("period_year", minYear)
        .lte("period_year", maxYear),
    ]);
  if (membersError) throw membersError;
  if (paymentsError) throw paymentsError;

  return getOverdueMemberIds(members ?? [], payments ?? [], monthWindow).size;
}

export default async function DashboardPage() {
  const overdueCount = await getOverdueCount();

  const statCards = [
    { label: "Active members", value: "—" },
    { label: "Classes this week", value: "—" },
    { label: "Overdue payments", value: String(overdueCount) },
    { label: "Today's check-ins", value: "—" },
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

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Recent activity</h2>
        <EmptyState
          icon={Activity}
          title="No recent activity yet"
          description="Actions you and your coaches take will show up here."
        />
      </div>
    </div>
  );
}
