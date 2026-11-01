"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@matos/shared";

type ClassType = Database["public"]["Enums"]["class_type"];

// Monday-first, the way a gym timetable is written; values are
// classes.day_of_week (0 = Sunday).
const WEEK = [
  { day: 1, short: "Mon" },
  { day: 2, short: "Tue" },
  { day: 3, short: "Wed" },
  { day: 4, short: "Thu" },
  { day: 5, short: "Fri" },
  { day: 6, short: "Sat" },
  { day: 0, short: "Sun" },
];

const TYPE_OPTIONS: { value: ClassType; label: string }[] = [
  { value: "gi", label: "Gi" },
  { value: "no_gi", label: "No-Gi" },
  { value: "comp", label: "Comp" },
  { value: "open_mat", label: "Open Mat" },
];

function useClasses() {
  return useQuery({
    queryKey: ["classes", "timetable"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, class_type, day_of_week, start_time, duration_minutes")
        .eq("active", true)
        .order("start_time");
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Stage O4: the /setup wizard's timetable step. Most gyms run the same
 * class on several days, so one entry ("Fundamentals, 19:00, 60 min, Mon
 * Wed Fri") creates one class per selected day via the existing
 * POST /api/classes. Full editing (capacity, renaming) stays on /classes.
 */
export function TimetableEditor() {
  const queryClient = useQueryClient();
  const { data: classes, isLoading, error } = useClasses();
  const [name, setName] = useState("");
  const [type, setType] = useState<ClassType>("gi");
  const [time, setTime] = useState("19:00");
  const [duration, setDuration] = useState("60");
  const [days, setDays] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["classes"] });

  function toggleDay(day: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function addClasses() {
    const minutes = Number(duration);
    if (!name.trim()) return toast.error("Give the class a name.");
    if (days.size === 0) return toast.error("Pick at least one day.");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return toast.error("Enter a start time.");
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) {
      return toast.error("Duration should be in minutes, e.g. 60.");
    }

    setSaving(true);
    const failedDays: number[] = [];
    for (const day of Array.from(days)) {
      try {
        const res = await fetch("/api/classes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            class_type: type,
            day_of_week: day,
            start_time: time,
            duration_minutes: minutes,
          }),
        });
        if (!res.ok) failedDays.push(day);
      } catch {
        failedDays.push(day);
      }
    }
    setSaving(false);
    await refresh();
    if (failedDays.length > 0) {
      // Leave only the failed days selected, so "try again" can't create
      // duplicates of the days that did save.
      setDays(new Set(failedDays));
      toast.error(
        `${failedDays.length} of ${days.size} couldn't be added — the days still selected need trying again.`,
      );
      return;
    }
    toast.success(`${name.trim()} added on ${days.size} day${days.size === 1 ? "" : "s"}.`);
    setName("");
    setDays(new Set());
  }

  async function removeClass(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/classes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Couldn't remove that class.");
      }
      await refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-md border p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tt-name">Class name</Label>
            <Input
              id="tt-name"
              className="h-11"
              placeholder="e.g. Fundamentals"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tt-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ClassType)}>
              <SelectTrigger id="tt-type" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Days</legend>
          <div className="grid grid-cols-7 gap-0.5">
            {WEEK.map(({ day, short }) => {
              const on = days.has(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day)}
                  className={`h-11 rounded-md border text-sm font-medium transition-colors ${
                    on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                  }`}
                >
                  {short}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3 sm:w-80">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tt-time">Starts</Label>
            <Input
              id="tt-time"
              type="time"
              className="h-11"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tt-duration">Minutes</Label>
            <Input
              id="tt-duration"
              type="number"
              inputMode="numeric"
              min={1}
              max={600}
              className="h-11"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
        </div>
        <Button className="h-11 self-start" onClick={addClasses} disabled={saving}>
          {saving ? "Adding..." : days.size > 1 ? `Add to ${days.size} days` : "Add class"}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="flex items-center justify-between text-sm font-medium">
          Your week
          <a
            href="/classes"
            className="-my-3 py-3 text-xs font-normal text-muted-foreground underline-offset-4 hover:underline"
          >
            Edit details on Classes
          </a>
        </h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : error ? (
          <p className="text-sm text-destructive">Couldn&apos;t load classes. Try refreshing.</p>
        ) : !classes || classes.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No classes yet — add your first one above.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {WEEK.map(({ day, short }) => {
              const dayClasses = classes.filter((c) => c.day_of_week === day);
              if (dayClasses.length === 0) return null;
              return (
                <li key={day} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {short}
                  </span>
                  <ul className="flex flex-col divide-y rounded-md border">
                    {dayClasses.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 pl-3">
                        <span className="min-w-0 truncate text-sm">
                          <span className="font-medium">{c.start_time.slice(0, 5)}</span> {c.name}{" "}
                          <span className="text-muted-foreground">
                            · {TYPE_OPTIONS.find((o) => o.value === c.class_type)?.label} ·{" "}
                            {c.duration_minutes} min
                          </span>
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 shrink-0"
                          onClick={() => removeClass(c.id)}
                          disabled={deletingId === c.id}
                          aria-label={`Remove ${c.name} on ${short}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
