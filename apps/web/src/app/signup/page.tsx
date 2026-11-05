"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, type SignupInput } from "@matos/shared";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/shared/logo";

type ApiErrorBody = { error: string; code: string; status: number };

export default function SignupPage() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { consent: false as unknown as true },
  });

  async function onSubmit(data: SignupInput) {
    setSubmitError(null);

    const res = await fetch("/api/signup", {
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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <Logo className="h-9" />
          </CardTitle>
          <CardDescription>
            Create your personal workspace — no academy or coach required to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  autoComplete="given-name"
                  className="h-11"
                  {...register("firstName")}
                />
                {errors.firstName ? (
                  <p className="text-sm text-destructive">{errors.firstName.message}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  autoComplete="family-name"
                  className="h-11"
                  {...register("lastName")}
                />
                {errors.lastName ? (
                  <p className="text-sm text-destructive">{errors.lastName.message}</p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                className="h-11"
                {...register("email")}
              />
              {errors.email ? (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              ) : null}
            </div>
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
                I consent to MatOS storing my analysis and account data as described in the data
                policy.
              </Label>
            </div>
            {errors.consent ? (
              <p className="text-sm text-destructive">{errors.consent.message}</p>
            ) : null}
            {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
            <Button type="submit" disabled={isSubmitting} className="h-11">
              {isSubmitting ? "Creating your workspace..." : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
