"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@matos/shared";

export type AttendanceEntry = {
  checkedInAt: string;
  checkedInBy: "self" | "coach" | "kiosk" | "guardian";
};

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Month-grid calendar for "which days did this athlete train" at a glance —
// the detailed list view is better for "which exact class did they attend,"
// this is for the complementary instant-scan use case. Built with plain
// date-fns rather than adding react-day-picker/a shadcn Calendar: this is
// the only calendar in the app so far and a full picker library is more
// than a read-only month-grid needs.
export function AttendanceCalendar({ entries }: { entries: AttendanceEntry[] }) {
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, AttendanceEntry[]>();
    for (const entry of entries) {
      const key = entry.checkedInAt.slice(0, 10);
      const existing = map.get(key);
      if (existing) existing.push(entry);
      else map.set(key, [entry]);
    }
    return map;
  }, [entries]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start, end });
  }, [month]);

  const selectedEntries = selectedDay ? (byDay.get(format(selectedDay, "yyyy-MM-dd")) ?? []) : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11"
          aria-label="Previous month"
          onClick={() => {
            setMonth((m) => subMonths(m, 1));
            setSelectedDay(null);
          }}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="font-medium">{format(month, "MMMM yyyy")}</p>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11"
          aria-label="Next month"
          onClick={() => {
            setMonth((m) => addMonths(m, 1));
            setSelectedDay(null);
          }}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={i} className="py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const inMonth = isSameMonth(day, month);
          // Leading/trailing days from adjacent months are unclickable
          // filler, same as any standard calendar grid — even if that date
          // happens to have attendance data, highlighting it here would
          // read as "trained on this day in the displayed month," which is
          // wrong (it isn't in the displayed month at all).
          const dayEntries = inMonth ? byDay.get(key) : undefined;
          const selected = selectedDay ? isSameDay(day, selectedDay) : false;

          return (
            <button
              key={key}
              type="button"
              disabled={!dayEntries}
              onClick={() => setSelectedDay(day)}
              className={cn(
                "flex h-11 flex-col items-center justify-center rounded-md text-sm transition-colors",
                !inMonth && "text-muted-foreground/40",
                inMonth && !dayEntries && "text-muted-foreground",
                dayEntries && "font-medium hover:bg-primary/20",
                dayEntries && !selected && "bg-primary/10 text-primary",
                selected && "bg-primary text-primary-foreground",
                isToday(day) && !selected && "ring-1 ring-inset ring-primary",
              )}
            >
              <span>{format(day, "d")}</span>
              {dayEntries ? (
                <span
                  className={cn(
                    "h-1 w-1 rounded-full",
                    selected ? "bg-primary-foreground" : "bg-primary",
                  )}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedDay ? (
        <div className="rounded-md border p-3 text-sm">
          <p className="mb-1 font-medium">{format(selectedDay, "EEEE, MMM d, yyyy")}</p>
          {selectedEntries.length === 0 ? (
            <p className="text-muted-foreground">No check-in this day.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {selectedEntries.map((entry, i) => (
                <li key={i} className="flex justify-between text-muted-foreground">
                  <span>{format(new Date(entry.checkedInAt), "h:mm a")}</span>
                  <span>
                    {entry.checkedInBy === "self"
                      ? "Self check-in"
                      : entry.checkedInBy === "guardian"
                        ? "Checked in by a parent"
                        : entry.checkedInBy === "kiosk"
                          ? "Kiosk check-in"
                          : "Marked by coach"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Tap a highlighted day to see check-in details.
        </p>
      )}
    </div>
  );
}
