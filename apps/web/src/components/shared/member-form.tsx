"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createMemberSchema, editMemberSchema } from "@matos/shared";
import { ALL_BELTS, BELT_LABELS, type BeltColor } from "@/components/shared/belt-display";
import { Button } from "@/components/ui/button";
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

// email is only ever collected/submitted in create mode (editMemberSchema
// omits it — changing the email a member logs in with is an auth.users
// concern, not this form) but kept optional here, not split into two
// hand-written types, so a single useForm/Controller wiring below can serve
// both modes; the resolver actually used at runtime always matches the
// active mode's real Zod schema.
type MemberFormValues = {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  membership_plan: "monthly" | "casual" | "comp_team";
  notes?: string;
  // Create mode only (Stage O2): starting rank + join date. After creation
  // belt only changes via Promote.
  belt?: BeltColor;
  stripes?: number;
  join_date?: string;
};

type MemberFormProps =
  { mode: "create" } | { mode: "edit"; memberId: string; defaultValues: MemberFormValues };

export function MemberForm(props: MemberFormProps) {
  const router = useRouter();
  const isEdit = props.mode === "edit";

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues>({
    // Cast needed: editMemberSchema's inferred type has no `email` key at
    // all (omitted, not just optional), which TS can't reconcile against a
    // single static MemberFormValues shared by both modes — the resolver
    // actually used always matches whichever schema is active at runtime.
    resolver: zodResolver(isEdit ? editMemberSchema : createMemberSchema) as never,
    defaultValues: isEdit
      ? props.defaultValues
      : { membership_plan: "monthly", belt: "white", stripes: 0, join_date: "" },
  });

  async function onSubmit(data: MemberFormValues) {
    const url = isEdit ? `/api/members/${props.memberId}` : "/api/members";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json();

    if (!res.ok) {
      toast.error(body.error ?? "Something went wrong.");
      return;
    }

    if (isEdit) {
      toast.success("Member updated.");
      router.push(`/members/${props.memberId}`);
    } else if (body.emailEnabled) {
      if (body.inviteSent) {
        toast.success(`${data.first_name} added — invite email sent.`);
      } else {
        toast.warning(
          `${data.first_name} added, but the invite email failed to send. Share their invite link instead.`,
        );
      }
      router.push(`/members/${body.memberId}${body.inviteSent ? "" : "?invite=1"}`);
    } else {
      // Stage O2 (no verified email domain): straight to the share dialog.
      toast.success(`${data.first_name} added.`);
      router.push(`/members/${body.memberId}?invite=1`);
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-lg flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="first_name">First name</Label>
          <Input id="first_name" className="h-11" {...register("first_name")} />
          {errors.first_name ? (
            <p className="text-sm text-destructive">{errors.first_name.message}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" className="h-11" {...register("last_name")} />
          {errors.last_name ? (
            <p className="text-sm text-destructive">{errors.last_name.message}</p>
          ) : null}
        </div>
      </div>

      {!isEdit ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" className="h-11" {...register("email")} />
          {errors.email ? <p className="text-sm text-destructive">{errors.email.message}</p> : null}
          <p className="text-xs text-muted-foreground">
            They&apos;ll sign in with this. You&apos;ll send them their sign-up link next.
          </p>
        </div>
      ) : null}

      {!isEdit ? (
        <fieldset className="flex flex-col gap-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">Current rank</legend>
          <div className="grid grid-cols-[1fr_auto] gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="belt">Belt</Label>
              <Controller
                name="belt"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-11" id="belt">
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
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stripes">Stripes</Label>
              <Controller
                name="stripes"
                control={control}
                render={({ field }) => (
                  <Select
                    value={String(field.value ?? 0)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger className="h-11 w-24" id="stripes">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3, 4].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {String(n)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          {errors.stripes ? (
            <p className="text-sm text-destructive">{errors.stripes.message}</p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="join_date">Training here since</Label>
            <Input id="join_date" type="date" className="h-11" {...register("join_date")} />
            {errors.join_date ? (
              <p className="text-sm text-destructive">{errors.join_date.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Leave blank for today.</p>
            )}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" className="h-11" {...register("phone")} />
        {errors.phone ? <p className="text-sm text-destructive">{errors.phone.message}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="emergency_contact_name">Emergency contact name</Label>
          <Input
            id="emergency_contact_name"
            className="h-11"
            {...register("emergency_contact_name")}
          />
          {errors.emergency_contact_name ? (
            <p className="text-sm text-destructive">{errors.emergency_contact_name.message}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="emergency_contact_phone">Emergency contact phone</Label>
          <Input
            id="emergency_contact_phone"
            className="h-11"
            {...register("emergency_contact_phone")}
          />
          {errors.emergency_contact_phone ? (
            <p className="text-sm text-destructive">{errors.emergency_contact_phone.message}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="membership_plan">Membership plan</Label>
        <Controller
          name="membership_plan"
          control={control}
          defaultValue={isEdit ? props.defaultValues.membership_plan : "monthly"}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="h-11" id="membership_plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="comp_team">Comp Team</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" {...register("notes")} />
        {errors.notes ? <p className="text-sm text-destructive">{errors.notes.message}</p> : null}
      </div>

      <Button type="submit" disabled={isSubmitting} className="h-11">
        {isSubmitting ? "Saving..." : isEdit ? "Save changes" : "Add member"}
      </Button>
    </form>
  );
}
