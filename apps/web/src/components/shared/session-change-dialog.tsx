"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addDaysToDate,
  dayOfWeekOfDate,
  formatClassTime,
  formatSessionDate,
  type SessionChange,
} from "@matos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ClassInfo = { id: string; name: string; day_of_week: number; start_time: string };

/** The class's next `count` session dates from `today` (inclusive). */
function nextSessionDates(dayOfWeek: number, today: string, count: number) {
  const offset = (dayOfWeek - dayOfWeekOfDate(today) + 7) % 7;
  return Array.from({ length: count }, (_, i) => addDaysToDate(today, offset + i * 7));
}

/**
 * Flow audit 3.2: cancel one session of a class, or move it (new time and/or
 * a date up to six days away). Sessions that already have a change aren't
 * offered — undo that change first from the list on the Classes page.
 */
export function SessionChangeDialog({
  classRow,
  today,
  changes,
  onSaved,
}: {
  classRow: ClassInfo;
  today: string;
  changes: SessionChange[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sessionDate, setSessionDate] = useState("");
  const [action, setAction] = useState<"cancel" | "move">("cancel");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState(classRow.start_time.slice(0, 5));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => {
    const taken = new Set(
      changes.filter((c) => c.class_id === classRow.id).map((c) => c.session_date),
    );
    return nextSessionDates(classRow.day_of_week, today, 8).filter((d) => !taken.has(d));
  }, [changes, classRow.id, classRow.day_of_week, today]);

  function reset() {
    setSessionDate(options[0] ?? "");
    setAction("cancel");
    setNewDate(options[0] ?? "");
    setNewTime(classRow.start_time.slice(0, 5));
    setNote("");
    setError(null);
  }

  const minNew = sessionDate ? [addDaysToDate(sessionDate, -6), today].sort()[1]! : today;
  const maxNew = sessionDate ? addDaysToDate(sessionDate, 6) : today;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sessionDate) {
      setError("Pick which session to change.");
      return;
    }
    if (action === "move" && (!newDate || !newTime)) {
      setError("Pick the new date and time.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/classes/${classRow.id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_date: sessionDate,
          action,
          ...(action === "move" ? { new_date: newDate, new_start_time: newTime } : {}),
          note: note.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't save the change.");
        return;
      }
      toast.success(
        action === "cancel"
          ? `${classRow.name} on ${formatSessionDate(sessionDate)} cancelled.`
          : `${classRow.name} moved to ${formatSessionDate(newDate)}, ${formatClassTime(newTime)}.`,
      );
      setOpen(false);
      onSaved();
    } catch {
      setError("Couldn't save — check your connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11">
          Cancel or move a date
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{classRow.name}: one date only</DialogTitle>
          <DialogDescription>
            Cancel or move a single session. The weekly timetable stays the same. Members see the
            change on their home and check-in pages.
          </DialogDescription>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every session in the next eight weeks already has a change.
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="session-date">Session</Label>
              <Select
                value={sessionDate}
                onValueChange={(v) => {
                  setSessionDate(v);
                  setNewDate(v);
                }}
              >
                <SelectTrigger id="session-date" className="h-11">
                  <SelectValue placeholder="Pick a date" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((d) => (
                    <SelectItem key={d} value={d}>
                      {formatSessionDate(d)}, {formatClassTime(classRow.start_time)}
                      {d === today ? " (today)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium">What&apos;s happening?</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["cancel", "move"] as const).map((a) => (
                  <Button
                    key={a}
                    type="button"
                    variant={action === a ? "default" : "outline"}
                    aria-pressed={action === a}
                    className="h-11"
                    onClick={() => setAction(a)}
                  >
                    {a === "cancel" ? "Cancel it" : "Move it"}
                  </Button>
                ))}
              </div>
            </fieldset>

            {action === "move" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-date">New date</Label>
                  <Input
                    id="new-date"
                    type="date"
                    className="h-11"
                    min={minNew}
                    max={maxNew}
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-time">New time</Label>
                  <Input
                    id="new-time"
                    type="time"
                    className="h-11"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                  />
                </div>
                <p className="col-span-2 text-xs text-muted-foreground">
                  Up to six days either side of the original date.
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="session-note">Note for members (optional)</Label>
              <Input
                id="session-note"
                className="h-11"
                maxLength={200}
                placeholder="e.g. Bank holiday"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="submit" className="h-11" disabled={saving}>
                {saving
                  ? "Saving..."
                  : action === "cancel"
                    ? "Cancel this session"
                    : "Move session"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
