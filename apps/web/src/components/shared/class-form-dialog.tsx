"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  CLASS_PROGRAM_LABELS,
  createClassSchema,
  editClassSchema,
  type ClassProgram,
} from "@matos/shared";
import { useGymStaff } from "@/hooks/use-gym-staff";
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

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CLASS_TYPE_LABELS = { gi: "Gi", no_gi: "No-Gi", comp: "Comp", open_mat: "Open Mat" } as const;

type ClassFormValues = {
  name: string;
  class_type: "gi" | "no_gi" | "comp" | "open_mat";
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  max_capacity?: number | null;
  active?: boolean;
  coach_member_id?: string | null;
  program?: ClassProgram;
};

/** Radix Select can't use "" as a value. */
const NO_COACH = "none";

type ClassFormDialogProps =
  | { mode: "create"; onSaved: () => void; trigger?: never }
  | { mode: "edit"; classId: string; defaultValues: ClassFormValues; onSaved: () => void };

export function ClassFormDialog(props: ClassFormDialogProps) {
  const isEdit = props.mode === "edit";
  const [open, setOpen] = useState(false);
  const { data: staff, isPending: staffPending } = useGymStaff();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClassFormValues>({
    resolver: zodResolver(isEdit ? editClassSchema : createClassSchema) as never,
    defaultValues: isEdit
      ? props.defaultValues
      : {
          class_type: "gi",
          day_of_week: 1,
          duration_minutes: 60,
          coach_member_id: null,
          program: "all_levels",
        },
  });

  async function onSubmit(data: ClassFormValues) {
    const url = isEdit ? `/api/classes/${props.classId}` : "/api/classes";
    const method = isEdit ? "PATCH" : "POST";
    const payload = { ...data, max_capacity: data.max_capacity || null };

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();

    if (!res.ok) {
      toast.error(body.error ?? "Something went wrong.");
      return;
    }

    toast.success(isEdit ? "Class updated." : "Class added.");
    setOpen(false);
    if (!isEdit) reset();
    props.onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="outline" className="h-11">
            Edit
          </Button>
        ) : (
          <Button className="h-11">Add class</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit class" : "Add class"}</DialogTitle>
          <DialogDescription>
            Recurring weekly class — one entry covers every week.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" className="h-11" {...register("name")} />
            {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Controller
              name="class_type"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CLASS_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="class-program">Programme</Label>
            <Controller
              name="program"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? "all_levels"} onValueChange={field.onChange}>
                  <SelectTrigger id="class-program" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CLASS_PROGRAM_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="class-coach">Coach (optional)</Label>
            <Controller
              name="coach_member_id"
              control={control}
              render={({ field }) => {
                // Active coaches and owners, plus whoever is assigned now, so
                // an edit doesn't silently show "No coach" for someone who
                // has since left.
                const options = (staff ?? []).filter((s) => s.active || s.id === field.value);
                return (
                  <Select
                    value={field.value ?? NO_COACH}
                    onValueChange={(v) => field.onChange(v === NO_COACH ? null : v)}
                    // Until the staff list arrives an assigned coach has no
                    // matching option and the trigger would look empty.
                    disabled={staffPending}
                  >
                    <SelectTrigger id="class-coach" className="h-11">
                      {staffPending ? <span>Loading coaches...</span> : <SelectValue />}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_COACH}>No coach</SelectItem>
                      {options.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.first_name} {s.last_name}
                          {!s.active ? " (no longer active)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              }}
            />
            {errors.coach_member_id ? (
              <p className="text-sm text-destructive">{errors.coach_member_id.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Day of week</Label>
            <Controller
              name="day_of_week"
              control={control}
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_LABELS.map((label, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="start_time">Start time</Label>
              <Input id="start_time" type="time" className="h-11" {...register("start_time")} />
              {errors.start_time ? (
                <p className="text-sm text-destructive">{errors.start_time.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="duration_minutes">Duration (min)</Label>
              <Input
                id="duration_minutes"
                type="number"
                className="h-11"
                {...register("duration_minutes", { valueAsNumber: true })}
              />
              {errors.duration_minutes ? (
                <p className="text-sm text-destructive">{errors.duration_minutes.message}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="max_capacity">Max capacity (optional)</Label>
            <Input
              id="max_capacity"
              type="number"
              className="h-11"
              {...register("max_capacity", {
                // `valueAsNumber` turns an empty (left-blank, since this
                // field is optional) input into NaN, not undefined — Zod's
                // z.number() rejects NaN even on an .optional() field, so
                // the form silently failed to submit whenever this field
                // was left blank, the expected common case, with no visible
                // error (nothing rendered its error message either — fixed
                // below too). Found via live end-to-end testing, not by
                // typecheck/lint, which have no way to catch this.
                setValueAs: (v) => (v === "" ? null : Number(v)),
              })}
            />
            {errors.max_capacity ? (
              <p className="text-sm text-destructive">{errors.max_capacity.message}</p>
            ) : null}
          </div>

          {isEdit ? (
            <label className="flex h-11 items-center gap-2 text-sm">
              <Controller
                name="active"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(c) => field.onChange(c === true)}
                  />
                )}
              />
              Active
            </label>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="h-11">
              {isSubmitting ? "Saving..." : isEdit ? "Save changes" : "Add class"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
