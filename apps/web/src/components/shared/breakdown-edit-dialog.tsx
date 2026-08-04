"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { updateBreakdownSchema } from "@matos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

type FormValues = {
  name: string;
  match_date: string;
  gi: boolean;
  // Zod's z.enum([...]).nullable().optional() (updateBreakdownSchema)
  // accepts undefined or null, not "" — an empty-string default here would
  // silently fail form validation and block submit with no visible error
  // (found via live testing, same bug class already documented in
  // class-form-dialog.tsx's max_capacity comment). undefined represents
  // "not set," never "".
  result?: "win" | "loss" | "draw";
  method?: "submission" | "points" | "decision" | "dq";
  visibility: "private" | "gym";
};

export function BreakdownEditDialog({
  breakdownId,
  defaultValues,
  onSaved,
}: {
  breakdownId: string;
  defaultValues: FormValues;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(updateBreakdownSchema) as never,
    defaultValues,
  });

  useEffect(() => {
    reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    defaultValues.name,
    defaultValues.match_date,
    defaultValues.gi,
    defaultValues.result,
    defaultValues.method,
    defaultValues.visibility,
  ]);

  async function onSubmit(data: FormValues) {
    const res = await fetch(`/api/breakdowns/${breakdownId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        match_date: data.match_date,
        gi: data.gi,
        result: data.result || null,
        method: data.method || null,
        visibility: data.visibility,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error ?? "Something went wrong.");
      return;
    }
    toast.success("Breakdown updated.");
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit breakdown</DialogTitle>
          <DialogDescription>
            Title, date, gi, and outcome — never the focus athlete.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Title</Label>
            <Input id="name" className="h-11" {...register("name")} />
            {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="match_date">Match date</Label>
            <Input id="match_date" type="date" className="h-11" {...register("match_date")} />
            {errors.match_date ? (
              <p className="text-sm text-destructive">{errors.match_date.message}</p>
            ) : null}
          </div>

          <label className="flex h-11 items-center gap-2 text-sm">
            <Controller
              name="gi"
              control={control}
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(c) => field.onChange(c === true)}
                />
              )}
            />
            Gi
          </label>

          <div className="flex flex-col gap-1.5">
            <Label>Result</Label>
            <Controller
              name="result"
              control={control}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Not decided yet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="win">Win</SelectItem>
                    <SelectItem value="loss">Loss</SelectItem>
                    <SelectItem value="draw">Draw</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Method</Label>
            <Controller
              name="method"
              control={control}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Not decided yet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="submission">Submission</SelectItem>
                    <SelectItem value="points">Points</SelectItem>
                    <SelectItem value="decision">Decision</SelectItem>
                    <SelectItem value="dq">DQ</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Visibility</Label>
            <Controller
              name="visibility"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private (only you)</SelectItem>
                    <SelectItem value="gym">Shared with gym (coach can see it)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="h-11">
              {isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
