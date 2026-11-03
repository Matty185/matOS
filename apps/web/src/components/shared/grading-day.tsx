"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Search } from "lucide-react";
import { ALL_BELTS, BELT_LABELS, MAX_GRADING_PROMOTIONS, type BeltColor } from "@matos/shared";
import { BeltDisplay } from "@/components/shared/belt-display";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type GradingRow = {
  id: string;
  name: string;
  belt: BeltColor;
  stripes: number;
  ready: boolean;
  suggested: { belt: BeltColor; stripes: number };
};

type Target = { belt: BeltColor; stripes: number };

const rankLabel = (t: Target) =>
  `${BELT_LABELS[t.belt]}${t.stripes > 0 ? `, ${t.stripes} stripe${t.stripes === 1 ? "" : "s"}` : ""}`;

// Flow audit 5.4: grading day. Tick who's being promoted, check each new
// rank, add one note for everyone, confirm.
export function GradingDay({ rows }: { rows: GradingRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Map<string, Target>>(new Map());
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, search]);
  const readyCount = rows.filter((r) => r.ready).length;
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  function toggle(row: GradingRow, on: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(row.id, prev.get(row.id) ?? row.suggested);
      else next.delete(row.id);
      return next;
    });
  }
  function setTarget(id: string, t: Target) {
    setSelected((prev) => new Map(prev).set(id, t));
  }
  const unchanged = Array.from(selected.entries()).filter(([id, t]) => {
    const r = byId.get(id);
    return r && r.belt === t.belt && r.stripes === t.stripes;
  });

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/promotions/grading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promotions: Array.from(selected.entries()).map(([member_id, t]) => ({
            member_id,
            belt: t.belt,
            stripes: t.stripes,
          })),
          notes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      const failed: { member_id: string; code?: string }[] = (body.results ?? []).filter(
        (r: { ok: boolean }) => !r.ok,
      );
      const failedNames = failed.map((f) => byId.get(f.member_id)?.name ?? "someone").join(", ");
      if (!res.ok) {
        // Nobody promoted: stay here with the selection so it can be fixed.
        toast.error(
          failed.length > 0
            ? `Nobody was promoted. Couldn't save: ${failedNames}.`
            : (body.error ?? "Couldn't save the grading."),
        );
        return;
      }
      if (failed.length > 0) {
        toast.warning(`${body.promoted} promoted. Couldn't save: ${failedNames}.`);
      } else {
        toast.success(`${body.promoted} ${body.promoted === 1 ? "member" : "members"} promoted.`);
      }
      setConfirmOpen(false);
      router.push("/promotions");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/promotions"
          className="inline-flex h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> Promotions
        </Link>
        <h1 className="font-heading text-3xl tracking-wide">Grading day</h1>
        <p className="text-sm text-muted-foreground">
          Tick everyone being promoted, check their new rank, then save them all at once. Each gets
          a belt-history entry and a notification, as with a single promotion.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="h-11 pl-9"
            placeholder="Search members"
            aria-label="Search members"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {readyCount > 0 ? (
          <Button
            variant="outline"
            className="h-11"
            onClick={() =>
              setSelected((prev) => {
                const next = new Map(prev);
                for (const r of rows) if (r.ready && !next.has(r.id)) next.set(r.id, r.suggested);
                return next;
              })
            }
          >
            Select everyone ready ({readyCount})
          </Button>
        ) : null}
        {selected.size > 0 ? (
          <Button variant="ghost" className="h-11" onClick={() => setSelected(new Map())}>
            Clear ({selected.size})
          </Button>
        ) : null}
      </div>

      <ul className="flex flex-col gap-2">
        {visible.map((r) => {
          const target = selected.get(r.id);
          return (
            <li key={r.id} className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  id={`g-${r.id}`}
                  className="h-5 w-5"
                  checked={!!target}
                  onCheckedChange={(v) => toggle(r, v === true)}
                />
                <Label
                  htmlFor={`g-${r.id}`}
                  className="flex flex-1 flex-wrap items-center gap-2 font-normal"
                >
                  <span className="font-medium">{r.name}</span>
                  <BeltDisplay belt={r.belt} stripes={r.stripes} size="sm" showLabel />
                  {r.ready ? <span className="text-xs text-primary">Ready</span> : null}
                </Label>
              </div>
              {target ? (
                <div className="grid grid-cols-[1fr_auto] gap-2 pl-8 sm:max-w-md">
                  <Select
                    value={target.belt}
                    onValueChange={(v) =>
                      setTarget(r.id, {
                        belt: v as BeltColor,
                        stripes: v === r.belt ? target.stripes : 0,
                      })
                    }
                  >
                    <SelectTrigger className="h-11" aria-label={`New belt for ${r.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_BELTS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {BELT_LABELS[b]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={String(target.stripes)}
                    onValueChange={(v) =>
                      setTarget(r.id, { belt: target.belt, stripes: Number(v) })
                    }
                  >
                    <SelectTrigger className="h-11 w-32" aria-label={`Stripes for ${r.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3, 4].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {`${n} stripe${n === 1 ? "" : "s"}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li className="text-sm text-muted-foreground">No members match that search.</li>
        ) : null}
      </ul>

      <div className="sticky bottom-0 flex flex-col gap-3 border-t bg-background py-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="grading-notes">Note for everyone (optional)</Label>
          <Textarea
            id="grading-notes"
            rows={2}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Winter grading, 15 November"
          />
        </div>
        <Button
          className="h-11"
          disabled={selected.size === 0 || selected.size > MAX_GRADING_PROMOTIONS}
          onClick={() => setConfirmOpen(true)}
        >
          {selected.size === 0
            ? "Tick members to promote"
            : `Promote ${selected.size} ${selected.size === 1 ? "member" : "members"}`}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Promote {selected.size} {selected.size === 1 ? "member" : "members"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2 text-sm">
                <ul className="flex flex-col gap-1">
                  {Array.from(selected.entries()).map(([id, t]) => {
                    const r = byId.get(id);
                    return r ? (
                      <li key={id}>
                        <span className="font-medium text-foreground">{r.name}</span>:{" "}
                        {rankLabel({ belt: r.belt, stripes: r.stripes })} → {rankLabel(t)}
                      </li>
                    ) : null;
                  })}
                </ul>
                {unchanged.length > 0 ? (
                  <p className="text-destructive">
                    {unchanged.length} {unchanged.length === 1 ? "member keeps" : "members keep"}{" "}
                    the same rank — change it or untick them.
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11"
              disabled={saving || unchanged.length > 0}
              onClick={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              {saving ? "Promoting..." : "Promote"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
