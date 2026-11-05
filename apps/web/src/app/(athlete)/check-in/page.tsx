"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CLASS_PROGRAM_LABELS,
  addDaysToDate,
  describeSessionChange,
  formatClassTime,
  sessionRuns,
  sessionsOnDate,
  type ClassSession,
  type Database,
  type SessionChange,
} from "@matos/shared";
import { useGymToday } from "@/hooks/use-gym-today";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

const CLASS_TYPE_LABELS: Record<ClassRow["class_type"], string> = {
  gi: "Gi",
  no_gi: "No-Gi",
  comp: "Comp",
  open_mat: "Open Mat",
};

const CHECK_IN_OPENS_MINUTES_BEFORE = 30;

// Mirrors the server-side window check in /api/attendance/check-in — this
// copy only decides which button state to *show*; the server independently
// re-validates the window and is the actual enforcement (CLAUDE.md: RLS/
// server checks are the boundary, client checks are UX convenience only).
function getWindowState(
  session: ClassSession<ClassRow>,
  now: Date,
): "too_early" | "open" | "too_late" {
  const classRow = session.classRow;
  const timeParts = session.startTime.split(":").map(Number);
  const hours = timeParts[0] ?? 0;
  const minutes = timeParts[1] ?? 0;
  const classStart = new Date(now);
  classStart.setHours(hours, minutes, 0, 0);
  const windowOpen = new Date(classStart.getTime() - CHECK_IN_OPENS_MINUTES_BEFORE * 60 * 1000);
  const windowClose = new Date(classStart.getTime() + classRow.duration_minutes * 60 * 1000);
  if (now < windowOpen) return "too_early";
  if (now > windowClose) return "too_late";
  return "open";
}

export default function CheckInPage() {
  const [now, setNow] = useState(() => new Date());
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // The gym's today (its timezone), matching the server's check-in rules.
  const today = useGymToday();

  // Re-evaluate window state every 30s so a class that just opened (or just
  // closed) updates without a manual refresh.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["check-in", "today", today],
    enabled: !!today,
    // Keep "N of M places taken" current while the page stays open.
    refetchInterval: 60_000,
    queryFn: async () => {
      const date = today!;
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // public.current_member() RPC, not a direct .eq("user_id", user.id)
      // query — the latter throws once this account has more than one
      // members row (Stage S2: a personal workspace plus a real gym).
      const { data: current } = await supabase.rpc("current_member");
      const member = current?.[0];
      if (!member) throw new Error("No member record");

      // All active classes, not just today's weekday: a session moved onto
      // today (flow audit 3.2) can belong to a class that usually runs on
      // another day.
      const [classesRes, attendanceRes, changesRes, coachRes, countRes] = await Promise.all([
        supabase.from("classes").select("*").eq("active", true),
        supabase
          .from("attendance")
          .select("class_id")
          .eq("member_id", member.id)
          .eq("checked_in_date", date),
        supabase
          .from("class_session_changes")
          .select("id, class_id, session_date, kind, new_date, new_start_time, note")
          .gte("session_date", addDaysToDate(date, -6))
          .lte("session_date", addDaysToDate(date, 6)),
        // Flow audit 3.3: coach names (athletes can't read staff rows).
        supabase.rpc("class_coach_names"),
        // Flow audit 3.5: how full each class is today (counts only).
        supabase.rpc("class_headcounts", { p_date: date }),
      ]);
      if (classesRes.error) throw classesRes.error;
      if (attendanceRes.error) throw attendanceRes.error;
      if (changesRes.error) throw changesRes.error;

      return {
        sessions: sessionsOnDate(classesRes.data, changesRes.data as SessionChange[], date),
        checkedInClassIds: new Set(attendanceRes.data.map((a) => a.class_id)),
        coachByClass: new Map(
          (coachRes.data ?? []).map((row) => [row.class_id, row.coach_name] as const),
        ),
        headcount: new Map(
          (countRes.data ?? []).map((row) => [row.class_id, row.headcount] as const),
        ),
      };
    },
  });

  async function handleCheckIn(classId: string) {
    setCheckingInId(classId);
    try {
      const res = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_id: classId }),
      });
      const body = await res.json();
      if (res.ok) {
        toast.success("Checked in!");
        queryClient.invalidateQueries({ queryKey: ["check-in"] });
      } else {
        toast.error(body.error ?? "Couldn't check in.");
        // e.g. CLASS_FULL: show the current headcount, not the stale one.
        queryClient.invalidateQueries({ queryKey: ["check-in"] });
      }
    } finally {
      setCheckingInId(null);
    }
  }

  if (isLoading || !today) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-3xl tracking-wide">Check In</h1>
        <p className="text-sm text-muted-foreground">Loading today&apos;s classes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-3xl tracking-wide">Check In</h1>
        <p className="text-sm text-destructive">
          Couldn&apos;t load today&apos;s classes. Try refreshing.
        </p>
      </div>
    );
  }

  if (!data || data.sessions.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-3xl tracking-wide">Check In</h1>
        <EmptyState
          icon={CalendarCheck}
          title="No classes today"
          description="Check back on a day your academy has classes scheduled."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Check In</h1>
      <ul className="flex flex-col gap-3">
        {data.sessions.map((session) => {
          const c = session.classRow;
          const alreadyCheckedIn = data.checkedInClassIds.has(c.id);
          const runs = sessionRuns(session.status);
          const windowState = getWindowState(session, now);
          const changeLabel = describeSessionChange(session);
          const count = data.headcount.get(c.id) ?? 0;
          const full = c.max_capacity !== null && count >= c.max_capacity;

          return (
            <li
              key={`${c.id}-${session.status}`}
              className={`flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between ${runs ? "" : "border-dashed"}`}
            >
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`font-medium ${runs ? "" : "text-muted-foreground line-through"}`}
                  >
                    {c.name}
                  </span>
                  <Badge variant="outline">{CLASS_TYPE_LABELS[c.class_type]}</Badge>
                  {c.program !== "all_levels" ? (
                    <Badge variant="secondary">{CLASS_PROGRAM_LABELS[c.program]}</Badge>
                  ) : null}
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatClassTime(session.startTime)} · {c.duration_minutes} min
                  {data.coachByClass.get(c.id) ? ` · ${data.coachByClass.get(c.id)}` : ""}
                </span>
                {runs && c.max_capacity !== null ? (
                  <span className="text-sm text-muted-foreground">
                    {count} of {c.max_capacity} places taken
                  </span>
                ) : null}
                {changeLabel ? (
                  <span className="text-sm text-muted-foreground">
                    {changeLabel}
                    {session.change?.note ? ` · ${session.change.note}` : ""}
                  </span>
                ) : null}
              </div>

              {!runs ? (
                <Badge
                  variant={session.status === "cancelled" ? "destructive" : "secondary"}
                  className="flex h-11 w-fit items-center px-3"
                >
                  {session.status === "cancelled" ? "Cancelled" : "Moved"}
                </Badge>
              ) : alreadyCheckedIn ? (
                <Badge className="flex h-11 w-fit items-center gap-1.5 px-3">
                  <CheckCircle2 className="h-4 w-4" /> Already checked in
                </Badge>
              ) : windowState === "too_early" ? (
                <p className="text-sm text-muted-foreground sm:max-w-40 sm:text-right">
                  Check-in opens 30 min before class
                </p>
              ) : windowState === "too_late" ? (
                <p className="text-sm text-muted-foreground sm:max-w-40 sm:text-right">
                  Check-in window has closed
                </p>
              ) : full ? (
                <p className="text-sm text-muted-foreground sm:max-w-40 sm:text-right">
                  Class is full. Ask a coach if there&apos;s room.
                </p>
              ) : (
                <Button
                  className="h-11"
                  onClick={() => handleCheckIn(c.id)}
                  disabled={checkingInId === c.id}
                >
                  {checkingInId === c.id ? "Checking in..." : "Check In"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
