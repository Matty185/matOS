import { CalendarDays, Flame } from "lucide-react";
import { getCurrentMember } from "@/lib/auth/current-member";
import { createClient } from "@/lib/supabase/server";
import { BeltDisplay } from "@/components/shared/belt-display";
import { EmptyState } from "@/components/shared/empty-state";
import {
  addDaysToDate,
  computeAttendanceStreak,
  computeUpcomingClasses,
  describeSessionChange,
  formatClassTime,
  formatSessionDate,
  gymWallClock,
  type SessionChange,
} from "@matos/shared";
import { Badge } from "@/components/ui/badge";
import { fetchSessionChanges } from "@/lib/classes/session-changes";
import { getGymTimeZone } from "@/lib/time/gym-timezone";
import type { Database } from "@matos/shared";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

const CLASS_TYPE_LABELS: Record<ClassRow["class_type"], string> = {
  gi: "Gi",
  no_gi: "No-Gi",
  comp: "Comp",
  open_mat: "Open Mat",
};

export default async function AthleteHomePage() {
  const member = await getCurrentMember();
  if (!member) return null;

  const supabase = createClient();

  const [{ data: memberRow }, { data: attendanceRows }, { data: classRows }] = await Promise.all([
    supabase.from("members").select("belt, stripes").eq("id", member.memberId).single(),
    supabase.from("attendance").select("checked_in_date").eq("member_id", member.memberId),
    supabase.from("classes").select("*").eq("active", true),
  ]);

  // Flow audit 3.2: list from the gym's today with one-off changes applied
  // (cancelled / moved sessions). If the changes can't be read, show the plain
  // timetable rather than failing the page.
  const timeZone = await getGymTimeZone(supabase, member.gymId);
  const today = gymWallClock(new Date(), timeZone).date;
  let changes: SessionChange[] = [];
  try {
    changes = await fetchSessionChanges(supabase, today, addDaysToDate(today, 6));
  } catch {
    console.error("[home] couldn't load class changes");
  }

  const streak = computeAttendanceStreak((attendanceRows ?? []).map((a) => a.checked_in_date));
  const upcoming = computeUpcomingClasses(classRows ?? [], { fromDate: today, changes, cap: 6 });

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
            {upcoming.map((session, i) => {
              const { date, classRow, startTime, status, change } = session;
              const off = status === "cancelled" || status === "moved_away";
              const label = describeSessionChange(session);
              return (
                <li
                  key={`${classRow.id}-${date}-${i}`}
                  className={`flex items-center justify-between gap-3 rounded-md border p-3 text-sm ${off ? "border-dashed" : ""}`}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={`font-medium ${off ? "text-muted-foreground line-through" : ""}`}
                    >
                      {classRow.name}
                    </span>
                    <span className="text-muted-foreground">
                      {date === today ? "Today" : formatSessionDate(date)} ·{" "}
                      {formatClassTime(startTime)} · {CLASS_TYPE_LABELS[classRow.class_type]}
                    </span>
                    {label ? (
                      <span className="text-muted-foreground">
                        {label}
                        {change?.note ? ` · ${change.note}` : ""}
                      </span>
                    ) : null}
                  </div>
                  {status === "cancelled" ? (
                    <Badge variant="destructive">Cancelled</Badge>
                  ) : status === "moved_away" ? (
                    <Badge variant="secondary">Moved</Badge>
                  ) : status === "moved_in" ? (
                    <Badge variant="secondary">Changed</Badge>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
