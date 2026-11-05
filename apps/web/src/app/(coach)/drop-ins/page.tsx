"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Footprints } from "lucide-react";
import { addDaysToDate, dayOfWeekOfDate, formatSessionDate } from "@matos/shared";
import { createClient } from "@/lib/supabase/client";
import { useGymToday } from "@/hooks/use-gym-today";
import { formatMoney } from "@/lib/payments/fees";
import {
  ALL_BELTS,
  BELT_LABELS,
  BeltDisplay,
  type BeltColor,
} from "@/components/shared/belt-display";
import { EmptyState } from "@/components/shared/empty-state";
import { WaiverText } from "@/components/shared/waiver-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Flow audit 4.6: drop-in visitors (a guest from another gym, someone
// travelling). Recorded by a coach against a class and date with the mat
// fee and the waiver. Visitors never get a login. Staff only (RLS).

const DAYS_SHOWN = 60;

type Visit = {
  id: string;
  class_id: string | null;
  visit_date: string;
  first_name: string;
  last_name: string;
  home_gym: string | null;
  belt: BeltColor | null;
  email: string | null;
  phone: string | null;
  fee: number | null;
  fee_paid: boolean;
  waiver_method: string;
};

type ClassRow = { id: string; name: string; day_of_week: number; start_time: string };

const NO_CLASS = "none";

export default function DropInsPage() {
  const today = useGymToday();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Visit | null>(null);

  const { data: classes } = useQuery({
    queryKey: ["drop-in-classes"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("classes")
        .select("id, name, day_of_week, start_time")
        .order("start_time");
      if (error) throw error;
      return data as ClassRow[];
    },
  });

  const {
    data: visits,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["drop-ins", today],
    enabled: !!today,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("drop_in_visits")
        .select(
          "id, class_id, visit_date, first_name, last_name, home_gym, belt, email, phone, fee, fee_paid, waiver_method",
        )
        .gte("visit_date", addDaysToDate(today!, -DAYS_SHOWN))
        .order("visit_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((v) => ({
        ...v,
        fee: v.fee === null ? null : Number(v.fee),
      })) as Visit[];
    },
  });

  const className = useMemo(
    () => new Map((classes ?? []).map((c) => [c.id, `${c.name} (${c.start_time.slice(0, 5)})`])),
    [classes],
  );

  const unpaidTotal = (visits ?? [])
    .filter((v) => !v.fee_paid && v.fee !== null)
    .reduce((s, v) => s + (v.fee ?? 0), 0);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["drop-ins"] });
  }

  async function markPaid(v: Visit) {
    const res = await fetch(`/api/drop-ins/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fee_paid: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Couldn't update.");
      return;
    }
    toast.success(`${v.first_name}'s mat fee marked paid.`);
    refresh();
  }

  async function remove(v: Visit) {
    const res = await fetch(`/api/drop-ins/${v.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Couldn't remove.");
      return;
    }
    toast.success("Visitor removed.");
    setRemoving(null);
    refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl tracking-wide">Visitors</h1>
          <p className="text-sm text-muted-foreground">
            Drop-ins from other academies and one-off visits. They count towards a class&apos;s
            capacity; they don&apos;t get a login.
          </p>
        </div>
        <Button className="h-11" onClick={() => setAdding(true)} disabled={!today}>
          Add a visitor
        </Button>
      </div>

      {unpaidTotal > 0 ? (
        <p className="rounded-md border p-3 text-sm">
          Unpaid mat fees in the last {DAYS_SHOWN} days: {formatMoney(unpaidTotal)}
        </p>
      ) : null}

      {isError ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          Couldn&apos;t load visitors. Try refreshing.
        </p>
      ) : isLoading || !today ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (visits ?? []).length === 0 ? (
        <EmptyState
          icon={Footprints}
          title="No visitors yet"
          description={`Visitors from the last ${DAYS_SHOWN} days show here.`}
          actionLabel="Add a visitor"
          onAction={() => setAdding(true)}
        />
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {(visits ?? []).map((v) => (
            <li key={v.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {v.first_name} {v.last_name}
                  </span>
                  {v.belt ? <BeltDisplay belt={v.belt} stripes={0} size="sm" /> : null}
                  {v.waiver_method === "none" ? <Badge variant="outline">No waiver</Badge> : null}
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatSessionDate(v.visit_date)}
                  {v.class_id ? ` · ${className.get(v.class_id) ?? "Class"}` : ""}
                  {v.home_gym ? ` · from ${v.home_gym}` : ""}
                </span>
                {v.fee !== null ? (
                  <span className="text-sm">
                    {formatMoney(v.fee)} · {v.fee_paid ? "paid" : "not paid"}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {v.fee !== null && !v.fee_paid ? (
                  <Button variant="outline" className="h-11" onClick={() => markPaid(v)}>
                    Mark paid
                  </Button>
                ) : null}
                <Button variant="ghost" className="h-11" onClick={() => setRemoving(v)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {today ? (
        <AddVisitorDialog
          open={adding}
          onOpenChange={setAdding}
          today={today}
          classes={classes ?? []}
          onSaved={refresh}
        />
      ) : null}

      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this visitor?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing
                ? `${removing.first_name} ${removing.last_name}'s visit on ${formatSessionDate(removing.visit_date)} will be deleted, including their contact details.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-11" onClick={() => removing && remove(removing)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddVisitorDialog({
  open,
  onOpenChange,
  today,
  classes,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  classes: ClassRow[];
  onSaved: () => void;
}) {
  const blank = {
    visit_date: today,
    class_id: NO_CLASS,
    first_name: "",
    last_name: "",
    home_gym: "",
    belt: "" as BeltColor | "",
    email: "",
    phone: "",
    fee: "",
    fee_paid: false,
    waiver_method: "none" as "none" | "typed" | "paper",
    waiver_signer_name: "",
  };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gym defaults: the usual mat fee and the current waiver.
  const { data: defaults } = useQuery({
    queryKey: ["drop-in-defaults"],
    enabled: open,
    queryFn: async () => {
      const supabase = createClient();
      const { data: me } = await supabase.rpc("current_member");
      const gymId = me?.[0]?.gym_id;
      const [{ data: gym }, { data: waiver }] = await Promise.all([
        supabase
          .from("gyms")
          .select("drop_in_fee")
          .eq("id", gymId ?? "")
          .maybeSingle(),
        supabase
          .from("waiver_versions")
          .select("id, version, body")
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      return {
        fee: gym?.drop_in_fee == null ? "" : String(Number(gym.drop_in_fee)),
        waiver: waiver ?? null,
      };
    },
  });

  // Fresh form each time it opens.
  useEffect(() => {
    if (open) setF({ ...blank, fee: defaults?.fee ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, today]);
  // The usual fee arrives a moment later: fill it only if still empty, so
  // nothing the coach has typed is reset.
  useEffect(() => {
    if (open && defaults?.fee) setF((p) => (p.fee === "" ? { ...p, fee: defaults.fee } : p));
  }, [open, defaults?.fee]);

  const dow = dayOfWeekOfDate(f.visit_date);
  const classesThatDay = classes.filter((c) => c.day_of_week === dow);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.first_name.trim() || !f.last_name.trim()) {
      setError("Enter the visitor's first and last name.");
      return;
    }
    if (f.waiver_method === "typed" && f.waiver_signer_name.trim().length < 2) {
      setError("The visitor types their full name to agree to the waiver.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/drop-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visit_date: f.visit_date,
          class_id: f.class_id === NO_CLASS ? null : f.class_id,
          first_name: f.first_name.trim(),
          last_name: f.last_name.trim(),
          home_gym: f.home_gym.trim(),
          belt: f.belt || null,
          email: f.email.trim(),
          phone: f.phone.trim(),
          fee: f.fee.trim(),
          fee_paid: f.fee_paid,
          waiver_method: f.waiver_method,
          waiver_signer_name: f.waiver_signer_name.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't add the visitor.");
        return;
      }
      toast.success(`${f.first_name.trim()} added.`);
      onOpenChange(false);
      onSaved();
    } catch {
      setError("Couldn't save — check your connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a visitor</DialogTitle>
          <DialogDescription>
            Someone training here once: a guest from another academy, or a visit.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-date">Date</Label>
              <Input
                id="v-date"
                type="date"
                className="h-11"
                max={today}
                min={addDaysToDate(today, -31)}
                value={f.visit_date}
                onChange={(e) =>
                  setF((p) => ({ ...p, visit_date: e.target.value, class_id: NO_CLASS }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-class">Class</Label>
              <Select value={f.class_id} onValueChange={(v) => set("class_id", v)}>
                <SelectTrigger className="h-11" id="v-class">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLASS}>No particular class</SelectItem>
                  {classesThatDay.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.start_time.slice(0, 5)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-first">First name</Label>
              <Input
                id="v-first"
                className="h-11"
                value={f.first_name}
                onChange={(e) => set("first_name", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-last">Last name</Label>
              <Input
                id="v-last"
                className="h-11"
                value={f.last_name}
                onChange={(e) => set("last_name", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-gym">Home academy (optional)</Label>
              <Input
                id="v-gym"
                className="h-11"
                value={f.home_gym}
                onChange={(e) => set("home_gym", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-belt">Belt (optional)</Label>
              <Select
                value={f.belt || "unknown"}
                onValueChange={(v) => set("belt", v === "unknown" ? "" : (v as BeltColor))}
              >
                <SelectTrigger className="h-11" id="v-belt">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">Not given</SelectItem>
                  {ALL_BELTS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {BELT_LABELS[b]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-email">Email (optional)</Label>
              <Input
                id="v-email"
                type="email"
                className="h-11"
                value={f.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-phone">Phone (optional)</Label>
              <Input
                id="v-phone"
                type="tel"
                className="h-11"
                value={f.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-fee">Mat fee (€)</Label>
              <Input
                id="v-fee"
                inputMode="decimal"
                className="h-11 w-32"
                value={f.fee}
                onChange={(e) => set("fee", e.target.value)}
              />
            </div>
            <label className="flex h-11 items-center gap-2 text-sm">
              <Checkbox checked={f.fee_paid} onCheckedChange={(c) => set("fee_paid", c === true)} />
              Paid
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="v-waiver">Waiver</Label>
            <Select
              value={f.waiver_method}
              onValueChange={(v) => set("waiver_method", v as typeof f.waiver_method)}
            >
              <SelectTrigger className="h-11" id="v-waiver">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not yet</SelectItem>
                {defaults?.waiver ? (
                  <SelectItem value="typed">They read it and type their name now</SelectItem>
                ) : null}
                <SelectItem value="paper">Signed on paper</SelectItem>
              </SelectContent>
            </Select>
            {f.waiver_method === "typed" && defaults?.waiver ? (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <div className="max-h-48 overflow-y-auto text-sm">
                  <WaiverText body={defaults.waiver.body} version={defaults.waiver.version} />
                </div>
                <Label htmlFor="v-signer">Visitor&apos;s full name, to agree</Label>
                <Input
                  id="v-signer"
                  className="h-11"
                  value={f.waiver_signer_name}
                  onChange={(e) => set("waiver_signer_name", e.target.value)}
                />
              </div>
            ) : null}
            {f.waiver_method === "paper" ? (
              <Input
                aria-label="Name on the paper waiver (optional)"
                placeholder="Name on the paper waiver (optional)"
                className="h-11"
                value={f.waiver_signer_name}
                onChange={(e) => set("waiver_signer_name", e.target.value)}
              />
            ) : null}
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" className="h-11" disabled={saving}>
              {saving ? "Saving..." : "Add visitor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
