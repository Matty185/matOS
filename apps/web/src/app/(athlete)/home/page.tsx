import { CalendarDays, Flame } from "lucide-react";
import { format } from "date-fns";
import { getCurrentMember } from "@/lib/auth/current-member";
import { createClient } from "@/lib/supabase/server";
import { BeltDisplay } from "@/components/shared/belt-display";
import { EmptyState } from "@/components/shared/empty-state";
import { computeAttendanceStreak, computeUpcomingClasses } from "@matos/shared";
import type { Database } from "@matos/shared";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

const CLASS_TYPE_LABELS: Record<ClassRow["class_type"], string> = {
  gi: "Gi",
  no_gi: "No-Gi",
  comp: "Comp",
  open_mat: "Open Mat",
};

function formatTime(time: string) {
  const parts = time.split(":");
  const h = Number(parts[0] ?? 0);
  const m = parts[1] ?? "00";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

export default async function AthleteHomePage() {
  const member = await getCurrentMember();
  if (!member) return null;

  const supabase = createClient();

  const [{ data: memberRow }, { data: attendanceRows }, { data: classRows }] = await Promise.all([
    supabase.from("members").select("belt, stripes").eq("id", member.memberId).single(),
    supabase.from("attendance").select("checked_in_date").eq("member_id", member.memberId),
    supabase.from("classes").select("*").eq("active", true),
  ]);

  const streak = computeAttendanceStreak((attendanceRows ?? []).map((a) => a.checked_in_date));
  const upcoming = computeUpcomingClasses(classRows ?? []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-3xl tracking-wide">Welcome, {member.firstName}</h1>
        {memberRow ? (
          <BeltDisplay belt={memberRow.belt} stripes={memberRow.stripes} size="lg" showLabel />
        ) : null}
      </div>

      <div className="flex items-center gap-3 rounded-md border p-4">
        <Flame className="h-8 w-8 shrink-0 text-primary" />
        <div>
          <p className="text-2xl font-semibold">
            {streak} {streak === 1 ? "week" : "weeks"}
          </p>
          <p className="text-sm text-muted-foreground">Current attendance streak</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Upcoming classes</h2>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No classes scheduled"
            description="Your gym's schedule will show up here once it's set up."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map(({ date, classRow }, i) => (
              <li
                key={`${classRow.id}-${i}`}
                className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{classRow.name}</span>
                  <span className="text-muted-foreground">
                    {format(date, "EEEE")} · {formatTime(classRow.start_time)} ·{" "}
                    {CLASS_TYPE_LABELS[classRow.class_type]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
