"use client";

import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { updateGymSchema, type UpdateGymInput } from "@matos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Zones a gym in Ireland/UK is overwhelmingly likely to need, pinned above
// the full IANA list so nobody scrolls through 400 entries to find Dublin.
const COMMON_ZONES = ["Europe/Dublin", "Europe/London"];

function allZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone").filter((z) => z.includes("/"));
  } catch {
    return COMMON_ZONES;
  }
}

/**
 * Stage O5: gym name/address/contact/timezone. Shared by Settings → Gym and
 * the /setup wizard's first step (which passes its own submit label and
 * advances on save).
 */
export function GymDetailsForm({
  defaultValues,
  submitLabel = "Save changes",
  onSaved,
}: {
  defaultValues: UpdateGymInput;
  submitLabel?: string;
  onSaved?: (data: UpdateGymInput) => void;
}) {
  const zones = useMemo(() => allZones().filter((z) => !COMMON_ZONES.includes(z)), []);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateGymInput>({
    resolver: zodResolver(updateGymSchema),
    defaultValues,
  });

  async function onSubmit(data: UpdateGymInput) {
    try {
      const res = await fetch("/api/gym", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't save the academy details.");
        return;
      }
      if (!onSaved) toast.success("Academy details saved.");
      // New baseline: the saved values are now the form's "clean" state.
      reset(data);
      onSaved?.(data);
    } catch {
      toast.error("Couldn't save — check your connection.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-lg flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gym-name">Academy name</Label>
        <Input id="gym-name" className="h-11" {...register("name")} />
        {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gym-address">Address</Label>
        <Input
          id="gym-address"
          className="h-11"
          autoComplete="street-address"
          {...register("address")}
        />
        {errors.address ? (
          <p className="text-sm text-destructive">{errors.address.message}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gym-email">Contact email</Label>
        <Input
          id="gym-email"
          type="email"
          className="h-11"
          autoComplete="email"
          {...register("contact_email")}
        />
        {errors.contact_email ? (
          <p className="text-sm text-destructive">{errors.contact_email.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Shown to members as who to contact.</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gym-timezone">Time zone</Label>
        <Controller
          name="timezone"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="gym-timezone" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {COMMON_ZONES.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z.replace("_", " ")}
                  </SelectItem>
                ))}
                <SelectSeparator />
                {zones.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.timezone ? (
          <p className="text-sm text-destructive">{errors.timezone.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Class times and check-in windows use this, including summer time.
          </p>
        )}
      </div>
      <Button
        type="submit"
        className="h-11 self-start"
        disabled={isSubmitting || (!onSaved && !isDirty)}
      >
        {isSubmitting ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
