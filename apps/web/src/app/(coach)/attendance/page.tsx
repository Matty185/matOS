"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@matos/shared";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type Member = Database["public"]["Tables"]["members"]["Row"];

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

function todayIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const [selectedDate, setSelectedDate] = useState(todayIsoDate());
  const queryClient = useQueryClient();

  // dayOfWeek matches the DB convention (0=Sunday..6=Saturday, date-fns'
  // getDay()) — parsed as a plain local date, not UTC, so the picker's date
  // maps to the day a coach actually sees on their calendar.
  const dayOfWeek = new Date(`${selectedDate}T00:00:00`).getDay();

  const { data: classes, isLoading } = useQuery({
    queryKey: ["classes", "by-day", dayOfWeek],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .eq("day_of_week", dayOfWeek)
        .eq("active", true)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Supabase Realtime — plan §7: "Attendance view uses Supabase realtime —
  // check-ins appear live." One subscription for the page rather than one
  // per class card; on any INSERT, invalidate every attendance query so
  // whichever class card is expanded picks it up. RLS still scopes what
  // this subscription can actually receive to the coach's own gym.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("attendance-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "attendance" }, () => {
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
        value={selectedDate}
        onChange={(e) => setSelectedDate(e.target.value)}
        className="h-11 w-48"
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading classes...</p>
      ) : !classes || classes.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No classes scheduled"
          description="No active classes are scheduled for this day of the week."
          actionLabel="Manage classes"
          actionHref="/classes"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {classes.map((c) => (
            <ClassAttendanceCard key={c.id} classRow={c} date={selectedDate} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClassAttendanceCard({ classRow, date }: { classRow: ClassRow; date: string }) {
  const [expanded, setExpanded] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["attendance-for-class", classRow.id, date],
    queryFn: async () => {
      const supabase = createClient();
      const [membersRes, attendanceRes] = await Promise.all([
        supabase.from("members").select("*").eq("active", true).order("last_name"),
        supabase
          .from("attendance")
          .select("member_id, checked_in_at, checked_in_by")
          .eq("class_id", classRow.id)
          .eq("checked_in_date", date),
      ]);
      if (membersRes.error) throw membersRes.error;
      if (attendanceRes.error) throw attendanceRes.error;
      return { members: membersRes.data as Member[], attendance: attendanceRes.data };
    },
    enabled: expanded,
  });

  const attendanceByMember = new Map((data?.attendance ?? []).map((a) => [a.member_id, a]));
  const checkedIn = (data?.members ?? []).filter((m) => attendanceByMember.has(m.id));
  const notCheckedIn = (data?.members ?? []).filter((m) => !attendanceByMember.has(m.id));

  async function handleMark(memberId: string) {
    setMarkingId(memberId);
    try {
      const res = await fetch("/api/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: memberId,
          class_id: classRow.id,
          checked_in_at: new Date(`${date}T12:00:00`).toISOString(),
        }),
      });
      const body = await res.json();
      if (res.ok) {
        toast.success("Marked present.");
        queryClient.invalidateQueries({ queryKey: ["attendance-for-class", classRow.id, date] });
      } else {
        toast.error(body.error ?? "Couldn't mark attendance.");
      }
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-3 p-3 text-left"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{classRow.name}</span>
            <Badge variant="outline" className="shrink-0">
              {CLASS_TYPE_LABELS[classRow.class_type]}
            </Badge>
          </div>
          <span className="text-sm text-muted-foreground">
            {formatTime(classRow.start_time)} · {classRow.duration_minutes} min
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
                      const record = attendanceByMember.get(m.id);
                      return (
                        <li key={m.id} className="flex items-center justify-between text-sm">
                          <span>
                            {m.first_name} {m.last_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {record?.checked_in_by === "self" ? "Self check-in" : "Marked by coach"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Not yet checked in ({notCheckedIn.length})</p>
                {notCheckedIn.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {(data?.members.length ?? 0) === 0
                      ? "No active members."
                      : "Everyone's checked in."}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {notCheckedIn.map((m) => (
                      <li key={m.id} className="flex items-center justify-between text-sm">
                        <span>
                          {m.first_name} {m.last_name}
                        </span>
                        <Button
                          variant="outline"
                          className="h-11"
                          onClick={() => handleMark(m.id)}
                          disabled={markingId === m.id}
                        >
                          {markingId === m.id ? "Marking..." : "Mark present"}
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
