"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { humanize, type PositionRow, type EventRow } from "@matos/shared";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TagEditDialogProps =
  | {
      kind: "position";
      open: boolean;
      onOpenChange: (open: boolean) => void;
      breakdownId: string;
      row: PositionRow;
      positionLabel: string;
      roleOptions: string[] | null;
      onSaved: () => void;
    }
  | {
      kind: "event";
      open: boolean;
      onOpenChange: (open: boolean) => void;
      breakdownId: string;
      row: EventRow;
      eventLabel: string;
      modifierOptions: string[] | null;
      outcomeOptions: string[] | null;
      onSaved: () => void;
    };

// Shared edit/delete surface for an already-placed tag (position interval
// or event) — reached from the tag list (always) and the timeline's
// markers (where screen space allows). A real, properly-sized (44px)
// dialog rather than relying on the timeline's necessarily-compact markers
// for anything beyond a quick jump-to-edit shortcut.
export function TagEditDialog(props: TagEditDialogProps) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isPosition = props.kind === "position";
  const [role, setRole] = useState(isPosition ? (props.row.role ?? "") : "");
  const [modifier, setModifier] = useState(!isPosition ? (props.row.modifier ?? "") : "");
  const [outcome, setOutcome] = useState(!isPosition ? (props.row.outcome ?? "") : "");
  const [startTs, setStartTs] = useState(isPosition ? String(props.row.start_ts) : "");
  const [endTs, setEndTs] = useState(
    isPosition && props.row.end_ts !== null ? String(props.row.end_ts) : "",
  );
  const [ts, setTs] = useState(!isPosition ? String(props.row.ts) : "");

  async function handleSave() {
    setSaving(true);
    try {
      const base = isPosition
        ? `/api/breakdowns/${props.breakdownId}/positions/${props.row.id}`
        : `/api/breakdowns/${props.breakdownId}/events/${props.row.id}`;
      const body = isPosition
        ? {
            role: role || null,
            start_ts: Number(startTs),
            end_ts: endTs === "" ? null : Number(endTs),
          }
        : {
            modifier: modifier || null,
            outcome: outcome || null,
            ts: Number(ts),
          };
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await res.json();
      if (!res.ok) {
        toast.error(responseBody.error ?? "Something went wrong.");
        return;
      }
      toast.success("Saved.");
      props.onOpenChange(false);
      props.onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const base = isPosition
        ? `/api/breakdowns/${props.breakdownId}/positions/${props.row.id}`
        : `/api/breakdowns/${props.breakdownId}/events/${props.row.id}`;
      const res = await fetch(base, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't delete this tag.");
        return;
      }
      toast.success("Deleted.");
      props.onOpenChange(false);
      props.onSaved();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isPosition ? props.positionLabel : props.eventLabel}</DialogTitle>
          <DialogDescription>Adjust or remove this tag.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {isPosition ? (
            <>
              {props.roleOptions && props.roleOptions.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Role</Label>
                  <Select value={role || undefined} onValueChange={setRole}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="No role" />
                    </SelectTrigger>
                    <SelectContent>
                      {props.roleOptions.map((r) => (
                        <SelectItem key={r} value={r}>
                          {humanize(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="start_ts">Start (seconds)</Label>
                  <Input
                    id="start_ts"
                    type="number"
                    className="h-11"
                    value={startTs}
                    onChange={(e) => setStartTs(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="end_ts">End (seconds, blank = open)</Label>
                  <Input
                    id="end_ts"
                    type="number"
                    className="h-11"
                    value={endTs}
                    onChange={(e) => setEndTs(e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {props.modifierOptions && props.modifierOptions.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Modifier</Label>
                  <Select value={modifier || undefined} onValueChange={setModifier}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {props.modifierOptions.map((m) => (
                        <SelectItem key={m} value={m}>
                          {humanize(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {props.outcomeOptions && props.outcomeOptions.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Outcome</Label>
                  <Select value={outcome || undefined} onValueChange={setOutcome}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {props.outcomeOptions.map((o) => (
                        <SelectItem key={o} value={o}>
                          {humanize(o)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ts">Timestamp (seconds)</Label>
                <Input
                  id="ts"
                  type="number"
                  className="h-11"
                  value={ts}
                  onChange={(e) => setTs(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            type="button"
            variant="destructive"
            className="h-11"
            disabled={deleting}
            onClick={handleDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" /> {deleting ? "Deleting..." : "Delete"}
          </Button>
          <Button type="button" className="h-11" disabled={saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
