"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, ChevronDown, Search } from "lucide-react";
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
import { useGymStaff } from "@/hooks/use-gym-staff";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type Member = Pick<
  Database["public"]["Tables"]["members"]["Row"],
  "id" | "first_name" | "last_name" | "role" | "active"
>;

function roleBadge(role: Member["role"]) {
  if (role === "athlete") return null;
  return (
    <Badge variant="secondary" className="ml-2">
      {role === "gym_owner" ? "Owner" : "Coach"}
    </Badge>
  );
}

const CLASS_TYPE_LABELS: Record<ClassRow["class_type"], string> = {
  gi: "Gi",
  no_gi: "No-Gi",
  comp: "Comp",
  open_mat: "Open Mat",
};

export default function AttendancePage() {
  // "Today" is the gym's today (flow audit 4.3), not the coach's device date.
  const gymToday = useGymToday();
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const selectedDate = pickedDate ?? gymToday;
  const queryClient = useQueryClient();
  const { data: staff } = useGymStaff();
  const staffById = useMemo(() => new Map((staff ?? []).map((s) => [s.id, s])), [staff]);

  // Flow audit 3.2: the date's sessions with one-off changes applied. All
  // active classes are needed: a session moved onto this date can belong to a
  // class that usually runs on another weekday.
  const {
    data: sessions,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["classes", "sessions-on", selectedDate],
    enabled: !!selectedDate,
    queryFn: async () => {
      const supabase = createClient();
      const date = selectedDate!;
      const [classesRes, changesRes] = await Promise.all([
        supabase.from("classes").select("*").eq("active", true),
        supabase
          .from("class_session_changes")
          .select("id, class_id, session_date, kind, new_date, new_start_time, note")
          .gte("session_date", addDaysToDate(date, -6))
          .lte("session_date", addDaysToDate(date, 6)),
      ]);
      if (classesRes.error) throw classesRes.error;
      if (changesRes.error) throw changesRes.error;
      return sessionsOnDate(classesRes.data, changesRes.data as SessionChange[], date);
    },
  });

  // Supabase Realtime — plan §7: "Attendance view uses Supabase realtime —
  // check-ins appear live." One subscription for the page; RLS scopes what
  // it can receive to the coach's own gym.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("attendance-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => {
        queryClient.invalidateQueries({ queryKey: ["attendance-for-class"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Attendance</h1>

      <Input
        type="date"
        aria-label="Date"
        value={selectedDate ?? ""}
        max={gymToday ?? undefined}
        onChange={(e) => setPickedDate(e.target.value || null)}
        className="h-11 w-48"
      />

      {!selectedDate || isLoading ? (
        <p className="text-sm text-muted-foreground">Loading classes...</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load classes. Try refreshing.
        </p>
      ) : !sessions || sessions.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No classes scheduled"
          description="No active classes are scheduled for this day of the week."
          actionLabel="Manage classes"
          actionHref="/classes"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((session) =>
            sessionRuns(session.status) ? (
              <ClassAttendanceCard
                key={`${session.classRow.id}-run`}
                session={session}
                date={selectedDate}
                coachName={(() => {
                  const coach = session.classRow.coach_member_id
                    ? staffById.get(session.classRow.coach_member_id)
                    : undefined;
                  return coach ? `${coach.first_name} ${coach.last_name}` : null;
                })()}
              />
            ) : (
              <ChangedSessionCard key={`${session.classRow.id}-off`} session={session} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function ChangedSessionCard({ session }: { session: ClassSession<ClassRow> }) {
  const label = describeSessionChange(session);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-4">
      <div className="flex flex-col gap-1">
        <span className="font-medium text-muted-foreground line-through">
          {session.classRow.name}
        </span>
        <span className="text-sm text-muted-foreground">
          {formatClassTime(session.startTime)}
          {label ? ` · ${label}` : ""}
          {session.change?.note ? ` · ${session.change.note}` : ""}
        </span>
      </div>
      <Badge variant={session.status === "cancelled" ? "destructive" : "secondary"}>
        {session.status === "cancelled" ? "Cancelled" : "Moved"}
      </Badge>
    </div>
  );
}

function ClassAttendanceCard({
  session,
  date,
  coachName,
}: {
  session: ClassSession<ClassRow>;
  date: string;
  coachName: string | null;
}) {
  const classRow = session.classRow;
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["attendance-for-class", classRow.id, date],
    queryFn: async () => {
      const supabase = createClient();
      const [membersRes, attendanceRes] = await Promise.all([
        // All members, not just active ones: a check-in by someone since
        // deactivated must still be visible (and removable). Only active
        // members are offered for marking.
        supabase
          .from("members")
          .select("id, first_name, last_name, role, active")
          .order("first_name"),
        supabase
          .from("attendance")
          .select("id, member_id, checked_in_at, checked_in_by, offline_queued")
          .eq("class_id", classRow.id)
          .eq("checked_in_date", date),
      ]);
      if (membersRes.error) throw membersRes.error;
      if (attendanceRes.error) throw attendanceRes.error;
      return { members: membersRes.data as Member[], attendance: attendanceRes.data };
    },
    enabled: expanded,
  });

  const attendanceByMember = useMemo(
    () => new Map((data?.attendance ?? []).map((a) => [a.member_id, a])),
    [data],
  );
  const checkedIn = (data?.members ?? []).filter((m) => attendanceByMember.has(m.id));
  const notCheckedIn = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.members ?? []).filter(
      (m) =>
        m.active &&
        !attendanceByMember.has(m.id) &&
        (!q || `${m.first_name} ${m.last_name}`.toLowerCase().includes(q)),
    );
  }, [data, attendanceByMember, search]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["attendance-for-class", classRow.id, date] });
  }

  async function handleMark(member: Member) {
    setBusyId(member.id);
    try {
      const res = await fetch("/api/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: member.id, class_id: classRow.id, date }),
      });
      const body = await res.json();
      if (res.ok) {
        toast.success(`${member.first_name} marked present.`);
        setSearch("");
        refresh();
      } else {
        toast.error(body.error ?? "Couldn't mark attendance.");
      }
    } catch {
      toast.error("Couldn't mark attendance — check your connection.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(member: Member, attendanceId: string) {
    if (
      !window.confirm(
        `Remove ${member.first_name}'s check-in for ${classRow.name}? Marking them again later records the class start time.`,
      )
    ) {
      return;
    }
    setBusyId(member.id);
    try {
      const res = await fetch(`/api/attendance/${attendanceId}`, { method: "DELETE" });
      const body = await res.json();
      if (res.ok) {
        toast.success(`Removed ${member.first_name}'s check-in.`);
        refresh();
      } else {
        toast.error(body.error ?? "Couldn't remove that check-in.");
      }
    } catch {
      toast.error("Couldn't remove that check-in — check your connection.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center justify-between gap-3 p-3 text-left"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate font-medium">{classRow.name}</span>
            <Badge variant="outline" className="shrink-0">
              {CLASS_TYPE_LABELS[classRow.class_type]}
            </Badge>
            {classRow.program !== "all_levels" ? (
              <Badge variant="secondary" className="shrink-0">
                {CLASS_PROGRAM_LABELS[classRow.program]}
              </Badge>
            ) : null}
          </div>
          <span className="text-sm text-muted-foreground">
            {formatClassTime(session.startTime)} · {classRow.duration_minutes} min
            {coachName ? ` · ${coachName}` : ""}
            {session.status === "moved_in" ? ` · ${describeSessionChange(session)}` : ""}
          </span>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded ? (
        <div className="flex flex-col gap-4 border-t p-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading attendees...</p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Checked in ({checkedIn.length})</p>
                {checkedIn.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No one yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {checkedIn.map((m) => {
                      const record = attendanceByMember.get(m.id)!;
                      return (
                        <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate">
                              {m.first_name} {m.last_name}
                              {roleBadge(m.role)}
                              {!m.active ? (
                                <Badge variant="outline" className="ml-2">
                                  Inactive
                                </Badge>
                              ) : null}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {record.checked_in_by === "self"
                                ? "Self check-in"
                                : record.checked_in_by === "kiosk"
                                  ? "Kiosk check-in"
                                  : "Marked by coach"}
                              {/* Stage M7: offline_queued's read path. */}
                              {record.offline_queued ? " (reconciled offline)" : ""}
                            </span>
                          </span>
                          <Button
                            variant="ghost"
                            className="h-11 shrink-0"
                            disabled={busyId === m.id}
                            onClick={() => handleRemove(m, record.id)}
                            aria-label={`Remove ${m.first_name} ${m.last_name}'s check-in`}
                          >
                            {busyId === m.id ? "Removing..." : "Remove"}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Mark someone present</p>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name"
                    aria-label="Search members to mark present"
                    className="h-11 pl-9"
                  />
                </div>
                {notCheckedIn.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {!(data?.members ?? []).some((m) => m.active)
                      ? "No active members."
                      : search
                        ? "No one matches that name."
                        : "Everyone's checked in."}
                  </p>
                ) : (
                  <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
                    {notCheckedIn.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">
                          {m.first_name} {m.last_name}
                          {roleBadge(m.role)}
                        </span>
                        <Button
                          variant="outline"
                          className="h-11 shrink-0"
                          onClick={() => handleMark(m)}
                          disabled={busyId === m.id}
                        >
                          {busyId === m.id ? "Marking..." : "Mark present"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
