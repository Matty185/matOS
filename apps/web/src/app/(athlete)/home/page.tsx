import { CalendarDays, Flame } from "lucide-react";
import { format, startOfWeek, subWeeks, addDays } from "date-fns";
import { getCurrentMember } from "@/lib/auth/current-member";
import { createClient } from "@/lib/supabase/server";
import { BeltDisplay } from "@/components/shared/belt-display";
import { EmptyState } from "@/components/shared/empty-state";
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

// "Streak" = consecutive Mon-Sun weeks with at least one check-in, walking
// backward from the most recent week that has one. The current week doesn't
// break the streak just because it's not over yet — if it has no check-in
// so far, counting starts from last week instead so a Tuesday-morning visit
// doesn't reset a streak that's still very much alive.
function computeStreak(checkInDates: string[]): number {
  if (checkInDates.length === 0) return 0;
  const weeksWithCheckin = new Set(
    checkInDates.map((d) =>
      format(startOfWeek(new Date(`${d}T00:00:00`), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    ),
  );
  let cursor = startOfWeek(new Date(), { weekStartsOn: 1 });
  if (!weeksWithCheckin.has(format(cursor, "yyyy-MM-dd"))) {
    cursor = subWeeks(cursor, 1);
  }
  let streak = 0;
  while (weeksWithCheckin.has(format(cursor, "yyyy-MM-dd"))) {
    streak++;
    cursor = subWeeks(cursor, 1);
  }
  return streak;
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

  const streak = computeStreak((attendanceRows ?? []).map((a) => a.checked_in_date));

  const upcoming: { date: Date; classRow: ClassRow }[] = [];
  for (let offset = 0; offset < 7 && upcoming.length < 5; offset++) {
    const date = addDays(new Date(), offset);
    const dayOfWeek = date.getDay();
    const dayClasses = (classRows ?? [])
      .filter((c) => c.day_of_week === dayOfWeek)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    for (const c of dayClasses) {
      if (upcoming.length >= 5) break;
      upcoming.push({ date, classRow: c });
    }
  }

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
