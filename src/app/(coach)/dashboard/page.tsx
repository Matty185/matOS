import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Activity } from "lucide-react";

const STAT_CARDS = [
  { label: "Active members" },
  { label: "Classes this week" },
  { label: "Overdue payments" },
  { label: "Today's check-ins" },
];

// Stage 3 shell only — these cards, and the activity feed below, get wired
// to real queries in Stages 4-7 (members, attendance, payments, agent audit
// log respectively). "—" rather than 0 here, since 0 would misrepresent
// data that simply isn't queried yet as a real count.
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STAT_CARDS.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">—</p>
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
