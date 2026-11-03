"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PauseCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useGymToday } from "@/hooks/use-gym-today";
import { describeHold, holdCovering, monthStartOf } from "@/lib/payments/holds";
import { HOLD_MONTHS_AHEAD, HOLD_MONTHS_BACK } from "@/lib/payments/hold-bounds";
import { HOLD_MAX_MONTHS, monthIndex } from "@matos/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Flow audit 2.4: a member's membership holds (whole months). Frozen months
// are never owed; check-in still works. Coach/owner only (the profile is a
// staff page; RLS enforces it anyway).

export type HoldListRow = { id: string; member_id: string; start_month: string; end_month: string };

export function useMemberHolds(memberId: string) {
  return useQuery({
    queryKey: ["member-holds", memberId],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("membership_holds")
        .select("id, member_id, start_month, end_month")
        .eq("member_id", memberId)
        .order("start_month", { ascending: false });
      if (error) throw error;
      return data as HoldListRow[];
    },
  });
}

/** "2026-12" for an index from monthIndex. */
function fromIndex(i: number): string {
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  return new Intl.DateTimeFormat("en-IE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${ym}-01T00:00:00Z`));
}

function range(from: number, to: number): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(fromIndex(i));
  return out;
}

export function MembershipHolds({
  memberId,
  memberName,
  canEdit,
}: {
  memberId: string;
  memberName: string;
  /** False for an inactive or non-billable member: list only. */
  canEdit: boolean;
}) {
  const today = useGymToday();
  const queryClient = useQueryClient();
  const { data: holds, isLoading, error } = useMemberHolds(memberId);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<HoldListRow | null>(null);
  const [busy, setBusy] = useState(false);

  const router = useRouter();

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["member-holds", memberId] });
    queryClient.invalidateQueries({ queryKey: ["member-payments", memberId] });
    queryClient.invalidateQueries({ queryKey: ["payments-holds"] });
    queryClient.invalidateQueries({ queryKey: ["holds-today"] });
    // Server-rendered surfaces (dashboard overdue count) on next visit.
    router.refresh();
  }

  async function remove(hold: HoldListRow) {
    setBusy(true);
    try {
      const res = await fetch(`/api/holds/${hold.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't remove the hold.");
        return;
      }
      toast.success("Hold removed.");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const thisMonth = today ? monthStartOf(today) : null;
  const current = holds && today ? holdCovering(holds, today) : null;

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4" aria-labelledby="holds-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PauseCircle className="h-5 w-5 text-muted-foreground" aria-hidden />
          <h2 id="holds-heading" className="font-medium">
            Membership hold
          </h2>
          {current ? <Badge variant="secondary">On hold now</Badge> : null}
        </div>
        {canEdit && today ? (
          <Button variant="outline" className="h-11" onClick={() => setAddOpen(true)}>
            Put on hold
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        No fee is owed for months on hold. {memberName.split(" ")[0]} can still check in.
      </p>

      {isLoading || !today ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">Couldn&apos;t load holds. Try refreshing.</p>
      ) : !holds || holds.length === 0 ? (
        <p className="text-sm text-muted-foreground">No holds.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {holds.map((h) => {
            const past = thisMonth !== null && h.end_month < thisMonth;
            return (
              <li
                key={h.id}
                className="flex flex-col gap-2 rounded-md bg-muted px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  {describeHold(h)}
                  {past ? <span className="text-muted-foreground"> · ended</span> : null}
                </span>
                {canEdit ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-11"
                      onClick={() => setEditing(h)}
                    >
                      Change end
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-11" disabled={busy}>
                          Remove
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove this hold?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {describeHold(h)} will count as normal months again, so any of them not
                            paid will show as overdue.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                          <AlertDialogAction className="h-11" onClick={() => remove(h)}>
                            Remove hold
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {today && addOpen ? (
        <AddHoldDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          memberId={memberId}
          memberName={memberName}
          today={today}
          onSaved={() => {
            setAddOpen(false);
            refresh();
          }}
        />
      ) : null}
      {today && editing ? (
        <EditHoldDialog
          hold={editing}
          today={today}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function MonthSelect({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="h-11">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((m) => (
          <SelectItem key={m} value={m}>
            {monthLabel(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddHoldDialog({
  open,
  onOpenChange,
  memberId,
  memberName,
  today,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  memberName: string;
  today: string;
  onSaved: () => void;
}) {
  const now = monthIndex(today.slice(0, 7));
  const [start, setStart] = useState(fromIndex(now));
  const [end, setEnd] = useState(fromIndex(now));
  const [saving, setSaving] = useState(false);

  const startOptions = range(now - HOLD_MONTHS_BACK, now + HOLD_MONTHS_AHEAD);
  const s = monthIndex(start);
  const endOptions = range(s, Math.min(s + HOLD_MAX_MONTHS - 1, now + HOLD_MONTHS_AHEAD));

  function changeStart(v: string) {
    setStart(v);
    const si = monthIndex(v);
    const ei = monthIndex(end);
    if (ei < si || ei > si + HOLD_MAX_MONTHS - 1) setEnd(v);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/members/${memberId}/holds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_month: start, end_month: end }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't save the hold.");
        return;
      }
      toast.success("Membership put on hold.");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const months = monthIndex(end) - s + 1;
  return (
    <Dialog
      open={open}
      // Mounted only while open (see the parent), so it always starts on
      // this month.
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Put {memberName} on hold</DialogTitle>
          <DialogDescription>
            Pick whole months, up to {HOLD_MAX_MONTHS}. No fee is owed for them, and any month
            already paid stays paid.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="hold-start">First month</Label>
            <MonthSelect
              id="hold-start"
              value={start}
              options={startOptions}
              onChange={changeStart}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="hold-end">Last month</Label>
            <MonthSelect id="hold-end" value={end} options={endOptions} onChange={setEnd} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {months === 1 ? "1 month" : `${months} months`} on hold.
        </p>
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Put on hold"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditHoldDialog({
  hold,
  today,
  onClose,
  onSaved,
}: {
  hold: HoldListRow;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const now = monthIndex(today.slice(0, 7));
  const s = monthIndex(hold.start_month.slice(0, 7));
  const [end, setEnd] = useState(hold.end_month.slice(0, 7));
  const [saving, setSaving] = useState(false);
  const options = range(s, Math.min(s + HOLD_MAX_MONTHS - 1, now + HOLD_MONTHS_AHEAD));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/holds/${hold.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ end_month: end }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't change the hold.");
        return;
      }
      toast.success("Hold updated.");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change when the hold ends</DialogTitle>
          <DialogDescription>
            It starts in {monthLabel(hold.start_month.slice(0, 7))}. End it early if they came back
            sooner, or extend it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="hold-edit-end">Last month on hold</Label>
          <MonthSelect id="hold-edit-end" value={end} options={options} onChange={setEnd} />
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button className="h-11" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
