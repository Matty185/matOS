"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney, PLAN_KIND_LABELS, type GymPlan } from "@/lib/payments/fees";

type Kind = GymPlan["kind"];

/**
 * Flow audit 6.7 + 8.3 (owner, Settings): the gym's membership plans and the
 * sibling discount. Prices are what the payment dialog suggests; nothing is
 * charged. A plan's type is fixed; plans are retired rather than deleted.
 */
export function PlansManager({
  plans,
  siblingDiscount,
  dropInFee,
  memberCounts,
}: {
  plans: GymPlan[];
  siblingDiscount: number;
  dropInFee: number | null;
  memberCounts: Record<string, number>;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);

  function changed() {
    void queryClient.invalidateQueries({ queryKey: ["gym-plans"] });
    void queryClient.invalidateQueries({ queryKey: ["fee-context"] });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col divide-y rounded-md border">
        {plans.map((p) =>
          editing === p.id ? (
            <li key={p.id} className="p-3">
              <PlanForm
                plan={p}
                onDone={(saved) => {
                  setEditing(null);
                  if (saved) changed();
                }}
              />
            </li>
          ) : (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  {p.active ? null : <Badge variant="outline">Retired</Badge>}
                </div>
                <span className="text-sm text-muted-foreground">
                  {PLAN_KIND_LABELS[p.kind]} ·{" "}
                  {p.price === null
                    ? "no price set"
                    : `${formatMoney(p.price)}${p.kind === "casual" ? " a class" : " a month"}`}{" "}
                  · {memberCounts[p.id] ?? 0} active member
                  {(memberCounts[p.id] ?? 0) === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="h-11" onClick={() => setEditing(p.id)}>
                  Edit
                </Button>
                <RetireButton plan={p} onChanged={changed} />
              </div>
            </li>
          ),
        )}
      </ul>

      {editing === "new" ? (
        <div className="rounded-md border p-3">
          <PlanForm
            onDone={(saved) => {
              setEditing(null);
              if (saved) changed();
            }}
          />
        </div>
      ) : (
        <Button variant="outline" className="h-11 w-fit" onClick={() => setEditing("new")}>
          Add a plan
        </Button>
      )}

      <SiblingDiscountForm value={siblingDiscount} onSaved={changed} />

      <DropInFeeForm value={dropInFee} onSaved={changed} />
    </div>
  );
}

function PlanForm({ plan, onDone }: { plan?: GymPlan; onDone: (saved: boolean) => void }) {
  const [name, setName] = useState(plan?.name ?? "");
  const [kind, setKind] = useState<Kind>(plan?.kind ?? "monthly");
  const [price, setPrice] = useState(plan?.price?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name the plan.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(plan ? `/api/gym/plans/${plan.id}` : "/api/gym/plans", {
        method: plan ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          plan
            ? { name: name.trim(), price: price.trim() }
            : { name: name.trim(), kind, price: price.trim() },
        ),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't save the plan.");
        return;
      }
      toast.success(plan ? "Plan saved." : "Plan added.");
      onDone(true);
    } catch {
      setError("Couldn't save — check your connection.");
    } finally {
      setSaving(false);
    }
  }

  const priceLabel =
    kind === "casual" ? "Price per class (€, optional)" : "Monthly price (€, optional)";

  return (
    <form onSubmit={save} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`plan-name-${plan?.id ?? "new"}`}>Plan name</Label>
        <Input
          id={`plan-name-${plan?.id ?? "new"}`}
          className="h-11"
          value={name}
          maxLength={60}
          placeholder="e.g. Kids monthly"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {plan ? (
        <p className="text-sm text-muted-foreground">
          Type: {PLAN_KIND_LABELS[plan.kind]} (fixed — add a new plan for a different type).
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-kind-new">Type</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger className="h-11" id="plan-kind-new">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">{PLAN_KIND_LABELS.monthly}</SelectItem>
              <SelectItem value="comp_team">{PLAN_KIND_LABELS.comp_team}</SelectItem>
              <SelectItem value="casual">{PLAN_KIND_LABELS.casual}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Monthly types show up on Payments and can be overdue; pay-per-class members don&apos;t
            owe a monthly fee.
          </p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`plan-price-${plan?.id ?? "new"}`}>{priceLabel}</Label>
        <Input
          id={`plan-price-${plan?.id ?? "new"}`}
          className="h-11 max-w-[12rem]"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" className="h-11" disabled={saving}>
          {saving ? "Saving..." : plan ? "Save" : "Add plan"}
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={() => onDone(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RetireButton({ plan, onChanged }: { plan: GymPlan; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/gym/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !plan.active }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't change the plan.");
        return;
      }
      toast.success(
        plan.active
          ? `${plan.name} retired. Members on it keep it; new members can't choose it.`
          : `${plan.name} is offered again.`,
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="ghost" className="h-11" onClick={toggle} disabled={busy}>
      {plan.active ? "Retire" : "Offer again"}
    </Button>
  );
}

function SiblingDiscountForm({ value, onSaved }: { value: number; onSaved: () => void }) {
  const [pct, setPct] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/gym/sibling-discount", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sibling_discount_percent: pct.trim() || "0" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't save.");
        return;
      }
      toast.success("Sibling discount saved.");
      onSaved();
    } catch {
      setError("Couldn't save — check your connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-1.5" noValidate>
      <Label htmlFor="sibling-discount">Sibling discount (%)</Label>
      <p className="text-sm text-muted-foreground">
        Off the monthly price for the second and later children who share a parent account. 0 turns
        it off.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="sibling-discount"
          className="h-11 w-24"
          inputMode="numeric"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          className="h-11"
          disabled={saving || pct === String(value)}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

// Flow audit 4.6: the usual mat fee for visitors (pre-filled on Visitors).
function DropInFeeForm({ value, onSaved }: { value: number | null; onSaved: () => void }) {
  const initial = value === null ? "" : String(value);
  const [fee, setFee] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/gym/drop-in-fee", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drop_in_fee: fee.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't save.");
        return;
      }
      toast.success("Mat fee saved.");
      onSaved();
    } catch {
      setError("Couldn't save — check your connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-1.5" noValidate>
      <Label htmlFor="drop-in-fee">Visitor mat fee (€)</Label>
      <p className="text-sm text-muted-foreground">
        Filled in when a coach adds a visitor. Leave blank for none.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="drop-in-fee"
          className="h-11 w-28"
          inputMode="decimal"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          className="h-11"
          disabled={saving || fee === initial}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
