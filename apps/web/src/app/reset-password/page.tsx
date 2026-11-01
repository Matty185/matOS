"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema, type ResetPasswordInput } from "@matos/shared";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LINK_INVALID =
  "This link has expired or has already been used. Ask your coach for a new one.";

// Stage O2: lands here from a coach-issued recovery link
// (/api/members/[id]/reset-link). The token is only verified on submit —
// not on page load — so a chat app's link preview (which fetches the URL
// but doesn't run this script) can't burn the single-use token, and a
// half-finished visit doesn't leave a signed-in session behind.
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Read once, then strip from the address bar/history — the token_hash is
  // itself the credential (security review O2).
  const [tokenHash] = useState(() => searchParams.get("token_hash"));
  const [formError, setFormError] = useState<string | null>(null);
  // Once verified, the single-use token is spent — a retry (e.g. after a
  // "too weak" rejection) must reuse the recovery session, not re-verify.
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (tokenHash) window.history.replaceState(null, "", "/reset-password");
  }, [tokenHash]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });

  if (!tokenHash) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-destructive">{LINK_INVALID}</p>
        <Button asChild variant="outline" className="h-11">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  async function onSubmit(data: ResetPasswordInput) {
    setFormError(null);
    const supabase = createClient();

    if (!verified) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash!,
        type: "recovery",
      });
      if (verifyError) {
        setFormError(LINK_INVALID);
        return;
      }
      setVerified(true);
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: data.password });
    if (updateError) {
      // Fixable by choosing another password: keep the recovery session so
      // they can retry without burning another link from their coach.
      if (updateError.code === "weak_password") {
        setFormError("That password is too weak or has appeared in a data breach — try another.");
        return;
      }
      if (updateError.code === "same_password") {
        setFormError("Choose a password different from your old one.");
        return;
      }
      // Anything else: sign the recovery session back out rather than
      // leave someone logged in on a possibly-shared device with the old
      // password still in force.
      await supabase.auth.signOut();
      setVerified(false);
      setFormError("Couldn't save your new password. Ask your coach for a new link.");
      return;
    }

    // Anyone else still signed in as this account (another device, or
    // whoever prompted the reset) is signed out. Best-effort — the new
    // password is already in force either way.
    await supabase.auth.signOut({ scope: "others" });

    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New password</Label>
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
        <Label htmlFor="confirmPassword">Confirm new password</Label>
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
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
      <Button type="submit" disabled={isSubmitting} className="h-11">
        {isSubmitting ? "Saving..." : "Set new password and sign in"}
      </Button>
      <p className="text-xs text-muted-foreground">
        If someone else is signed in on this device, they&apos;ll be signed out.
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-heading text-3xl tracking-wide text-primary">MatOS</CardTitle>
          <CardDescription>Choose a new password</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
            <ResetPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
