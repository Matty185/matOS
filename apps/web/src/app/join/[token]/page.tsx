"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { joinGymSchema, type JoinGymInput } from "@matos/shared";
import { createClient } from "@/lib/supabase/client";
import { ALL_BELTS, BELT_LABELS } from "@/components/shared/belt-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/shared/logo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ApiErrorBody = { error: string; code: string; status: number };
type FormValues = z.input<typeof joinGymSchema>;

// Stage O7: self-serve sign-up from a coach's one-time link. The person
// fills in their own details; the account and member row are created
// together on submit (POST /api/join/[token]).
export default function JoinGymPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    data: info,
    isLoading,
    error: fetchError,
  } = useQuery<{ gymName: string | null }, ApiErrorBody>({
    queryKey: ["join-link", params.token],
    queryFn: async () => {
      const res = await fetch(`/api/join/${params.token}`);
      const body = await res.json();
      if (!res.ok) throw body as ApiErrorBody;
      return body;
    },
    retry: false,
  });

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, JoinGymInput>({
    resolver: zodResolver(joinGymSchema),
    defaultValues: {
      belt: "white",
      stripes: 0,
      existing_account: false,
      consent: false as unknown as true,
    },
  });

  const existingAccount = watch("existing_account");
  const consent = watch("consent");
  const gymLabel = info?.gymName ?? "the gym";

  function setExistingAccount(value: boolean) {
    setValue("existing_account", value);
    setValue("password", "");
    setValue("confirmPassword", "");
    clearErrors(["password", "confirmPassword"]);
  }

  async function onSubmit(data: JoinGymInput) {
    setSubmitError(null);
    let res: Response;
    try {
      res = await fetch(`/api/join/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      setSubmitError("Couldn't reach MatOS — check your connection and try again.");
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = body as ApiErrorBody;
      // The server found an existing MatOS account for this email: switch
      // the form to "use your existing password" rather than dead-ending.
      if (err.code === "ACCOUNT_EXISTS") setExistingAccount(true);
      if (err.code === "NO_ACCOUNT") setExistingAccount(false);
      setSubmitError(err.error ?? "Something went wrong.");
      return;
    }

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (signInError) {
      router.replace("/login");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (fetchError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Link unavailable</CardTitle>
            <CardDescription>
              {fetchError.error ?? "This sign-up link isn't valid."}
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <Logo className="h-9" />
          </CardTitle>
          <CardDescription>
            Join {gymLabel}. Fill in your details and choose a password — this takes about a minute.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="First name" id="first_name" error={errors.first_name?.message}>
                <Input
                  id="first_name"
                  autoComplete="given-name"
                  className="h-11"
                  {...register("first_name")}
                />
              </Field>
              <Field label="Last name" id="last_name" error={errors.last_name?.message}>
                <Input
                  id="last_name"
                  autoComplete="family-name"
                  className="h-11"
                  {...register("last_name")}
                />
              </Field>
            </div>

            <Field
              label="Email"
              id="email"
              error={errors.email?.message}
              hint="You'll sign in with this."
            >
              <Input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                className="h-11"
                {...register("email")}
              />
            </Field>

            <Field label="Phone (optional)" id="phone" error={errors.phone?.message}>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                className="h-11"
                {...register("phone")}
              />
            </Field>

            <fieldset className="flex flex-col gap-3 rounded-md border p-4">
              <legend className="px-1 text-sm font-medium">Your current belt</legend>
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
              <p className="text-xs text-muted-foreground">
                New to BJJ? Leave it on white. Your coach can correct this later.
              </p>
            </fieldset>

            <fieldset className="flex flex-col gap-3 rounded-md border p-4">
              <legend className="px-1 text-sm font-medium">Emergency contact (optional)</legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Name" id="emergency_contact_name">
                  <Input
                    id="emergency_contact_name"
                    className="h-11"
                    {...register("emergency_contact_name")}
                  />
                </Field>
                <Field label="Phone" id="emergency_contact_phone">
                  <Input
                    id="emergency_contact_phone"
                    type="tel"
                    className="h-11"
                    {...register("emergency_contact_phone")}
                  />
                </Field>
              </div>
            </fieldset>

            {existingAccount ? (
              <div className="flex flex-col gap-3 rounded-md bg-muted p-4">
                <p className="text-sm">
                  This email already has a MatOS account. Enter its password to add {gymLabel} to it
                  — anything already in that account stays as it is.
                </p>
                <Field label="Your MatOS password" id="password" error={errors.password?.message}>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    className="h-11"
                    {...register("password")}
                  />
                </Field>
                <Button
                  type="button"
                  variant="link"
                  className="h-11 self-start px-0"
                  onClick={() => {
                    setExistingAccount(false);
                    setSubmitError(null);
                  }}
                >
                  Use a different email instead
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Choose a password" id="password" error={errors.password?.message}>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    className="h-11"
                    {...register("password")}
                  />
                </Field>
                <Field
                  label="Confirm password"
                  id="confirmPassword"
                  error={errors.confirmPassword?.message}
                >
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    className="h-11"
                    {...register("confirmPassword")}
                  />
                </Field>
              </div>
            )}

            <div className="flex items-start gap-2">
              <Checkbox
                id="consent"
                checked={consent === true}
                onCheckedChange={(checked) =>
                  setValue("consent", (checked === true) as unknown as true, {
                    shouldValidate: true,
                  })
                }
                className="mt-0.5"
              />
              <Label htmlFor="consent" className="text-sm font-normal leading-snug">
                I consent to MatOS storing my membership, attendance, and payment data as described
                in {info?.gymName ? `${info.gymName}'s` : "the gym's"} data policy.
              </Label>
            </div>
            {errors.consent ? (
              <p className="text-sm text-destructive">{errors.consent.message}</p>
            ) : null}

            {submitError ? (
              <p role="alert" className="text-sm text-destructive">
                {submitError}
              </p>
            ) : null}

            <Button type="submit" disabled={isSubmitting} className="h-11">
              {isSubmitting ? "Signing you up..." : `Join ${gymLabel}`}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function Field({
  label,
  id,
  error,
  hint,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
