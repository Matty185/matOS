"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  claimInviteSchema,
  attachInviteSchema,
  type ClaimInviteInput,
  type AttachInviteInput,
} from "@matos/shared";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type InviteInfo = {
  memberFirstName: string | null;
  gymName: string | null;
  accountExists: boolean;
};
type ApiErrorBody = { error: string; code: string; status: number };

async function submitClaim(
  token: string,
  data: ClaimInviteInput | AttachInviteInput,
): Promise<{ email: string } | { error: string }> {
  const res = await fetch(`/api/invite/${token}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) return { error: (body as ApiErrorBody).error ?? "Something went wrong." };
  return body as { email: string };
}

async function signInAndRedirect(
  router: ReturnType<typeof useRouter>,
  email: string,
  password: string,
) {
  const supabase = createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    // Account was linked successfully; sign-in itself failing (rare — e.g.
    // a dropped connection) shouldn't strand the user with no path forward.
    router.replace("/login");
    return;
  }

  router.replace("/");
  router.refresh();
}

// New-account branch (no existing auth.users row for this email): sets a
// password, same as before Stage S2.
function NewAccountForm({ token, gymName }: { token: string; gymName: string | null }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

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
    const result = await submitClaim(token, data);
    if ("error" in result) {
      setSubmitError(result.error);
      return;
    }
    await signInAndRedirect(router, result.email, data.password);
  }

  return (
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
          I consent to MatOS storing my membership, attendance, and payment data as described in
          {gymName ? ` ${gymName}'s` : " the gym's"} data policy.
        </Label>
      </div>
      {errors.consent ? <p className="text-sm text-destructive">{errors.consent.message}</p> : null}
      {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
      <Button type="submit" disabled={isSubmitting} className="h-11">
        {isSubmitting ? "Setting up your account..." : "Create account"}
      </Button>
    </form>
  );
}

// Attach branch (the email already has an auth.users account — most
// commonly a solo signup accepting a gym invite): verifies the *existing*
// password instead of setting a new one. No confirmPassword field, since
// nothing is being set.
function AttachAccountForm({ token, gymName }: { token: string; gymName: string | null }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AttachInviteInput>({
    resolver: zodResolver(attachInviteSchema),
    defaultValues: { consent: false as unknown as true },
  });

  async function onSubmit(data: AttachInviteInput) {
    setSubmitError(null);
    const result = await submitClaim(token, data);
    if ("error" in result) {
      setSubmitError(result.error);
      return;
    }
    await signInAndRedirect(router, result.email, data.password);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted-foreground">
        This email already has a MatOS account. Enter your password to link
        {gymName ? ` ${gymName}` : " this gym"} to it — your existing workspace stays exactly as it
        is.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          className="h-11"
          {...register("password")}
        />
        {errors.password ? (
          <p className="text-sm text-destructive">{errors.password.message}</p>
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
          I consent to MatOS storing my membership, attendance, and payment data as described in
          {gymName ? ` ${gymName}'s` : " the gym's"} data policy.
        </Label>
      </div>
      {errors.consent ? <p className="text-sm text-destructive">{errors.consent.message}</p> : null}
      {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
      <Button type="submit" disabled={isSubmitting} className="h-11">
        {isSubmitting ? "Linking..." : "Accept invite"}
      </Button>
    </form>
  );
}

export default function ClaimInvitePage({ params }: { params: { token: string } }) {
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
            {invite?.accountExists
              ? `Confirm you'd like to join${invite?.gymName ? ` ${invite.gymName}` : " this gym"}.`
              : `Set your password to join${invite?.gymName ? ` ${invite.gymName}` : " your gym"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invite?.accountExists ? (
            <AttachAccountForm token={params.token} gymName={invite?.gymName ?? null} />
          ) : (
            <NewAccountForm token={params.token} gymName={invite?.gymName ?? null} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
