"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/types/database";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

const CLASS_TYPE_LABELS: Record<ClassRow["class_type"], string> = {
  gi: "Gi",
  no_gi: "No-Gi",
  comp: "Comp",
  open_mat: "Open Mat",
};

const CHECK_IN_OPENS_MINUTES_BEFORE = 30;

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
  return new Date(now.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

// Mirrors the server-side window check in /api/attendance/check-in — this
// copy only decides which button state to *show*; the server independently
// re-validates the window and is the actual enforcement (CLAUDE.md: RLS/
// server checks are the boundary, client checks are UX convenience only).
function getWindowState(classRow: ClassRow, now: Date): "too_early" | "open" | "too_late" {
  const timeParts = classRow.start_time.split(":").map(Number);
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
  const today = todayIsoDate();
  const dayOfWeek = new Date(`${today}T00:00:00`).getDay();

  // Re-evaluate window state every 30s so a class that just opened (or just
  // closed) updates without a manual refresh.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["check-in", "today", dayOfWeek],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data: member } = await supabase
        .from("members")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!member) throw new Error("No member record");

      const [classesRes, attendanceRes] = await Promise.all([
        supabase
          .from("classes")
          .select("*")
          .eq("day_of_week", dayOfWeek)
          .eq("active", true)
          .order("start_time", { ascending: true }),
        supabase
          .from("attendance")
          .select("class_id")
          .eq("member_id", member.id)
          .eq("checked_in_date", today),
      ]);
      if (classesRes.error) throw classesRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      return {
        classes: classesRes.data,
        checkedInClassIds: new Set(attendanceRes.data.map((a) => a.class_id)),
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
      }
    } finally {
      setCheckingInId(null);
    }
  }

  if (isLoading) {
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

  if (!data || data.classes.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-3xl tracking-wide">Check In</h1>
        <EmptyState
          icon={CalendarCheck}
          title="No classes today"
          description="Check back on a day your gym has classes scheduled."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Check In</h1>
      <ul className="flex flex-col gap-3">
        {data.classes.map((c) => {
          const alreadyCheckedIn = data.checkedInClassIds.has(c.id);
          const windowState = getWindowState(c, now);

          return (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <Badge variant="outline">{CLASS_TYPE_LABELS[c.class_type]}</Badge>
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatTime(c.start_time)} · {c.duration_minutes} min
                </span>
              </div>

              {alreadyCheckedIn ? (
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
