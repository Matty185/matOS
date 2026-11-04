"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/payments/fees";
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
  plan_id?: string | null;
  notes?: string;
  // Create mode only (Stage O2): starting rank + join date. After creation
  // belt only changes via Promote.
  belt?: BeltColor;
  stripes?: number;
  join_date?: string;
};

type MemberFormProps =
  | {
      mode: "create";
      // Flow audit 9.1: "Add as member" from a trial lead pre-fills the form
      // and marks the lead converted once the member exists.
      prefill?: Partial<MemberFormValues>;
      leadId?: string;
    }
  | {
      mode: "edit";
      memberId: string;
      defaultValues: MemberFormValues;
      // Signed-up members' email is their login and can't be edited here.
      emailLocked: boolean;
    };

export function MemberForm(props: MemberFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = props.mode === "edit";

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues>({
    // Cast needed: editMemberSchema's inferred type has no `email` key at
    // all (omitted, not just optional), which TS can't reconcile against a
    // single static MemberFormValues shared by both modes — the resolver
    // actually used always matches whichever schema is active at runtime.
    resolver: zodResolver(isEdit ? editMemberSchema : createMemberSchema) as never,
    defaultValues: isEdit
      ? props.defaultValues
      : {
          membership_plan: "monthly",
          belt: "white",
          stripes: 0,
          join_date: "",
          ...(props.mode === "create" ? props.prefill : {}),
        },
  });

  // Flow audit 6.7: the gym's own plans. RLS limits gym_plans to the
  // caller's current gym. Without any (e.g. before the migration), the
  // fixed billing types below are shown instead.
  const currentPlanId = isEdit ? (props.defaultValues.plan_id ?? null) : null;
  const { data: plans } = useQuery({
    queryKey: ["gym-plans"],
    queryFn: async () => {
      const { data } = await createClient()
        .from("gym_plans")
        .select("id, name, kind, price, active, sort_order")
        .order("sort_order")
        .order("created_at");
      return data ?? [];
    },
  });

  // New members start on the first current plan of their billing type.
  // Never in edit mode: that could silently change an existing member's
  // billing type on an unrelated save.
  useEffect(() => {
    if (isEdit || !plans || plans.length === 0 || getValues("plan_id")) return;
    const kind = getValues("membership_plan") ?? "monthly";
    const first = plans.find((p) => p.active && p.kind === kind);
    if (first) {
      setValue("plan_id", first.id);
      setValue("membership_plan", first.kind);
    }
  }, [isEdit, plans, getValues, setValue]);

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
    // Plans and sibling order feed the payment price suggestions.
    void queryClient.invalidateQueries({ queryKey: ["fee-context"] });

    if (props.mode === "create" && props.leadId) {
      const conv = await fetch(`/api/trial-leads/${props.leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "converted", converted_member_id: body.memberId }),
      }).catch(() => null);
      if (!conv || !conv.ok) {
        toast.warning("Member added, but the trial request couldn't be marked as joined.");
      }
    }

    if (isEdit) {
      toast.success("Member updated.");
      router.push(`/members/${props.memberId}`);
    } else if (body.emailEnabled && data.email) {
      if (body.inviteSent) {
        toast.success(`${data.first_name} added — invite email sent.`);
      } else {
        toast.warning(
          `${data.first_name} added, but the invite email failed to send. Share their invite link instead.`,
        );
      }
      router.push(`/members/${body.memberId}${body.inviteSent ? "" : "?invite=1"}`);
    } else if (!data.email) {
      toast.success(`${data.first_name} added to the roster (no login).`);
      router.push(`/members/${body.memberId}`);
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          className="h-11"
          disabled={isEdit && props.emailLocked}
          {...register("email")}
        />
        {errors.email ? <p className="text-sm text-destructive">{errors.email.message}</p> : null}
        <p className="text-xs text-muted-foreground">
          {isEdit && props.emailLocked
            ? "They sign in with this email, so it can't be changed here."
            : "They'll sign in with this. Leave it blank for kids or anyone without their own email — they'll be on the roster without a login."}
        </p>
      </div>

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
          <Label htmlFor="emergency_contact_name">Parent or emergency contact</Label>
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
          <Label htmlFor="emergency_contact_phone">Parent or emergency contact phone</Label>
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

      {plans && plans.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan_id">Membership plan</Label>
          <Controller
            name="plan_id"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value ?? undefined}
                onValueChange={(v) => {
                  field.onChange(v);
                  const plan = plans.find((p) => p.id === v);
                  if (plan) setValue("membership_plan", plan.kind);
                }}
              >
                <SelectTrigger className="h-11" id="plan_id">
                  <SelectValue placeholder="Choose a plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans
                    .filter((p) => p.active || p.id === currentPlanId)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.price !== null
                          ? ` · ${formatMoney(Number(p.price))}${p.kind === "casual" ? " a class" : " a month"}`
                          : ""}
                        {p.active ? "" : " (retired)"}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.plan_id ? (
            <p className="text-sm text-destructive">{errors.plan_id.message}</p>
          ) : null}
        </div>
      ) : (
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
      )}

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
