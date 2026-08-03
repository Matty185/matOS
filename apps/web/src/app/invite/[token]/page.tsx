"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { claimInviteSchema, type ClaimInviteInput } from "@matos/shared";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type InviteInfo = { memberFirstName: string | null; gymName: string | null };
type ApiErrorBody = { error: string; code: string; status: number };

export default function ClaimInvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  const {
    data: invite,
    isLoading,
    error: fetchError,
  } = useQuery<InviteInfo, ApiErrorBody>({
    queryKey: ["invite", params.token],
    queryFn: async () => {
      const res = await fetch(`/api/invite/${params.token}`);
      const body = await res.json();
      if (!res.ok) throw body as ApiErrorBody;
      return body as InviteInfo;
    },
    retry: false,
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ClaimInviteInput>({
    resolver: zodResolver(claimInviteSchema),
    defaultValues: { consent: false as unknown as true },
  });

  async function onSubmit(data: ClaimInviteInput) {
    setSubmitError(null);

    const res = await fetch(`/api/invite/${params.token}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json();

    if (!res.ok) {
      setSubmitError((body as ApiErrorBody).error ?? "Something went wrong.");
      return;
    }

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: (body as { email: string }).email,
      password: data.password,
    });

    if (signInError) {
      // Account was created successfully; sign-in itself failing (rare —
      // e.g. a dropped connection) shouldn't strand the user with no path
      // forward.
      router.replace("/login");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-muted-foreground">Loading invite...</p>
      </main>
    );
  }

  if (fetchError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Invite unavailable</CardTitle>
            <CardDescription>{fetchError.error}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-heading text-3xl tracking-wide text-primary">MatOS</CardTitle>
          <CardDescription>
            {invite?.memberFirstName ? `Welcome, ${invite.memberFirstName}. ` : ""}
            Set your password to join{invite?.gymName ? ` ${invite.gymName}` : " your gym"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                className="h-11"
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                className="h-11"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword ? (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              ) : null}
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="consent"
                checked={consentChecked}
                onCheckedChange={(checked) => {
                  const value = checked === true;
                  setConsentChecked(value);
                  setValue("consent", value as unknown as true, { shouldValidate: true });
                }}
                className="mt-0.5"
              />
              <Label htmlFor="consent" className="text-sm font-normal leading-snug">
                I consent to MatOS storing my membership, attendance, and payment data as described
                in the gym&apos;s data policy.
              </Label>
            </div>
            {errors.consent ? (
              <p className="text-sm text-destructive">{errors.consent.message}</p>
            ) : null}
            {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
            <Button type="submit" disabled={isSubmitting} className="h-11">
              {isSubmitting ? "Setting up your account..." : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
