"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { recordPaymentSchema } from "@matos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import type { PaymentStatus } from "@/lib/payments/overdue";
import type { Fee } from "@/lib/payments/fees";

type FormValues = {
  status: PaymentStatus;
  amount?: number | null;
  notes?: string;
};

type PaymentCellDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  memberId: string;
  periodMonth: number;
  periodYear: number;
  existing: { status: PaymentStatus; amount: number | null; notes: string | null } | null;
  /** The member's plan fee (flow audit 6.7), pre-filled when no amount is recorded yet. */
  fee?: Fee | null;
  onSaved: () => void;
};

export function PaymentCellDialog({
  open,
  onOpenChange,
  memberName,
  memberId,
  periodMonth,
  periodYear,
  existing,
  fee = null,
  onSaved,
}: PaymentCellDialogProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(
      recordPaymentSchema.omit({ member_id: true, period_month: true, period_year: true }),
    ) as never,
    defaultValues: { status: "unpaid", amount: null, notes: "" },
  });

  // A single dialog instance is reused across every cell in the grid (100+
  // member x month combinations) rather than mounting one per cell, so the
  // form has to be explicitly re-synced to whichever cell was just clicked
  // instead of relying on defaultValues (only read once, at first mount).
  // The payments-grid query is ordered deterministically so `existing` stays
  // referentially stable across a background refetch of unchanged data
  // (structural sharing) — the isDirty guard is defense-in-depth on top of
  // that, so a stray resync while the coach has unsaved edits can't
  // silently clobber them.
  useEffect(() => {
    if (!open || isDirty) return;
    reset({
      status: existing?.status ?? "unpaid",
      amount:
        existing?.amount ??
        (!existing || existing.status !== "waived" ? (fee?.amount ?? null) : null),
      notes: existing?.notes ?? "",
    });
  }, [open, memberId, periodMonth, periodYear, existing, fee?.amount, isDirty, reset]);

  // Clears isDirty on close so the guard above doesn't block the resync
  // effect the next time a *different* cell is opened (isDirty otherwise
  // persists from whatever the coach last typed, even if they closed
  // without saving).
  useEffect(() => {
    if (open) return;
    reset({ status: "unpaid", amount: null, notes: "" });
  }, [open, reset]);

  async function onSubmit(data: FormValues) {
    const res = await fetch("/api/payments/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        member_id: memberId,
        period_month: periodMonth,
        period_year: periodYear,
        status: data.status,
        amount: data.amount || null,
        notes: data.notes || undefined,
      }),
    });
    const body = await res.json();

    if (!res.ok) {
      toast.error(body.error ?? "Something went wrong.");
      return;
    }

    toast.success("Payment updated.");
    reset();
    onOpenChange(false);
    onSaved();
  }

  const periodLabel = format(new Date(periodYear, periodMonth - 1), "MMMM yyyy");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {memberName} — {periodLabel}
          </DialogTitle>
          <DialogDescription>
            Record or update this member&apos;s payment for the period.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="waived">Waived</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount (optional)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              className="h-11"
              {...register("amount", {
                setValueAs: (v) => (v === "" ? null : Number(v)),
              })}
            />
            {errors.amount ? (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            ) : fee ? (
              <p className="text-sm text-muted-foreground">Plan price — {fee.note}.</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" {...register("notes")} />
            {errors.notes ? (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="h-11">
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
