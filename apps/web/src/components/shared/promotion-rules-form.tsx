"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Flow audit 5.3: the owner's guidance for "ready for the next stripe".
 * Blank turns a criterion off; at least one stays on (server-checked too).
 */
export function PromotionRulesForm({
  classesPerStripe,
  monthsPerStripe,
  onSaved,
}: {
  classesPerStripe: number | null;
  monthsPerStripe: number | null;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [classes, setClasses] = useState(classesPerStripe?.toString() ?? "");
  const [months, setMonths] = useState(monthsPerStripe?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    classes !== (classesPerStripe?.toString() ?? "") ||
    months !== (monthsPerStripe?.toString() ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!classes.trim() && !months.trim()) {
      setError("Set at least one: classes or months.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/gym/promotion-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promotion_classes_per_stripe: classes.trim(),
          promotion_months_per_stripe: months.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't save.");
        return;
      }
      toast.success("Promotion guidance saved.");
      onSaved?.();
      router.refresh();
    } catch {
      setError("Couldn't save — check your connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted-foreground">
        Someone shows as <strong>ready</strong> for their next stripe once they&apos;ve hit both
        numbers since their last promotion. It&apos;s a guide — you still decide. Leave one blank to
        ignore it.
      </p>
      <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="classes-per-stripe">Classes per stripe</Label>
          <Input
            id="classes-per-stripe"
            inputMode="numeric"
            className="h-11"
            value={classes}
            onChange={(e) => setClasses(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="months-per-stripe">Months per stripe</Label>
          <Input
            id="months-per-stripe"
            inputMode="numeric"
            className="h-11"
            value={months}
            onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))}
          />
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="h-11 self-start" disabled={saving || !dirty}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
