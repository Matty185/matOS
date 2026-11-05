"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CLASS_PROGRAM_LABELS,
  addDaysToDate,
  describeSessionChange,
  formatClassTime,
  formatSessionDate,
  sessionRuns,
  sessionsOnDate,
  type ClassProgram,
  type Database,
  type SessionChange,
} from "@matos/shared";
import { useGymToday } from "@/hooks/use-gym-today";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

const DAYS_SHOWN = 7;

const CLASS_TYPE_LABELS: Record<ClassRow["class_type"], string> = {
  gi: "Gi",
  no_gi: "No-Gi",
  comp: "Comp",
  open_mat: "Open Mat",
};

// Flow audit 3.6: the gym's week, from today, as members see it — the weekly
// template with one-off cancellations and moves (3.2) applied, plus each
// class's programme and coach (3.3/3.4). Read-only; checking in stays on the
// Check In page.
export default function TimetablePage() {
  // Re-render once a minute so a page left open past midnight moves on to
  // the new day (useGymToday recomputes the date on each render).
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const today = useGymToday();
  const [program, setProgram] = useState<ClassProgram | "all">("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["timetable", today],
    enabled: !!today,
    queryFn: async () => {
      const from = today!;
      const supabase = createClient();
      // Moves reach six days either side of a session, so changes are read
      // from six days before the first date to six after the last.
      const [classesRes, changesRes, coachRes] = await Promise.all([
        supabase.from("classes").select("*").eq("active", true),
        supabase
          .from("class_session_changes")
          .select("id, class_id, session_date, kind, new_date, new_start_time, note")
          .gte("session_date", addDaysToDate(from, -6))
          .lte("session_date", addDaysToDate(from, DAYS_SHOWN - 1 + 6)),
        supabase.rpc("class_coach_names"),
      ]);
      if (classesRes.error) throw classesRes.error;
      if (changesRes.error) throw changesRes.error;

      const changes = changesRes.data as SessionChange[];
      return {
        classes: classesRes.data,
        days: Array.from({ length: DAYS_SHOWN }, (_, i) => {
          const date = addDaysToDate(from, i);
          return { date, sessions: sessionsOnDate(classesRes.data, changes, date) };
        }),
        // Coach names are a nicety: without them the timetable still works.
        coachByClass: new Map(
          (coachRes.data ?? []).map((row) => [row.class_id, row.coach_name] as const),
        ),
      };
    },
  });

  const header = <h1 className="font-heading text-3xl tracking-wide">Timetable</h1>;

  if (isLoading || !today) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-sm text-muted-foreground">Loading the week...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-sm text-destructive">
          Couldn&apos;t load the timetable. Try refreshing.
        </p>
      </div>
    );
  }

  if (data.classes.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          icon={CalendarDays}
          title="No classes scheduled"
          description="Your academy hasn't added its timetable yet. Check back soon."
        />
      </div>
    );
  }

  // Filter chips only for programmes this gym actually runs.
  const programs = Array.from(new Set(data.classes.map((c) => c.program)));
  const showFilter = programs.length > 1;
  const activeProgram = program !== "all" && programs.includes(program) ? program : "all";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        {header}
        <p className="text-sm text-muted-foreground">
          The next seven days, including any cancelled or moved classes.
        </p>
      </div>

      {showFilter ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by programme">
          {(["all", ...programs] as const).map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={activeProgram === p ? "default" : "outline"}
              className="h-11"
              aria-pressed={activeProgram === p}
              onClick={() => setProgram(p)}
            >
              {p === "all" ? "All classes" : CLASS_PROGRAM_LABELS[p]}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        {data.days.map(({ date, sessions }) => {
          const shown = sessions.filter(
            (s) => activeProgram === "all" || s.classRow.program === activeProgram,
          );
          const isToday = date === today;
          return (
            <section key={date} className="flex flex-col gap-2" aria-labelledby={`day-${date}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 id={`day-${date}`} className="text-lg font-medium">
                  {isToday ? `Today · ${formatSessionDate(date)}` : formatSessionDate(date)}
                </h2>
                {isToday && shown.some((s) => sessionRuns(s.status)) ? (
                  <Button asChild variant="outline" size="sm" className="h-11">
                    <Link href="/check-in">Go to check-in</Link>
                  </Button>
                ) : null}
              </div>
              {shown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No classes.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {shown.map((session) => {
                    const c = session.classRow;
                    const runs = sessionRuns(session.status);
                    // The badge already says "Cancelled"; the line then only carries the note.
                    const changeLabel =
                      session.status === "cancelled" ? null : describeSessionChange(session);
                    const coach = data.coachByClass.get(c.id);
                    return (
                      <li
                        key={`${c.id}-${session.status}`}
                        className={`flex flex-col gap-1 rounded-md border p-3 ${runs ? "" : "border-dashed"}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium tabular-nums">
                            {formatClassTime(session.startTime)}
                          </span>
                          <span
                            className={`font-medium ${runs ? "" : "text-muted-foreground line-through"}`}
                          >
                            {c.name}
                          </span>
                          <Badge variant="outline">{CLASS_TYPE_LABELS[c.class_type]}</Badge>
                          {c.program !== "all_levels" ? (
                            <Badge variant="secondary">{CLASS_PROGRAM_LABELS[c.program]}</Badge>
                          ) : null}
                          {session.status === "cancelled" ? (
                            <Badge variant="destructive">Cancelled</Badge>
                          ) : session.status === "moved_away" ? (
                            <Badge variant="secondary">Moved</Badge>
                          ) : null}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {c.duration_minutes} min{coach ? ` · ${coach}` : ""}
                        </span>
                        {changeLabel || session.change?.note ? (
                          <span className="text-sm text-muted-foreground">
                            {[changeLabel, session.change?.note].filter(Boolean).join(" · ")}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
