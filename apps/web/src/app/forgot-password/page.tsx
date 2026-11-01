import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Stage O2: no email-based self-service reset until a sending domain is
// verified — a coach issues a one-hour reset link from the member's
// profile instead (see /api/members/[id]/reset-link). Honest about that
// rather than showing an email field that silently never delivers.
export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </div>
          <CardTitle className="font-heading text-3xl tracking-wide">
            Forgot your password?
          </CardTitle>
          <CardDescription>No problem — your coach can sort it in seconds.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            <li>Ask your coach for a password reset link.</li>
            <li>They&apos;ll send it to you, or show you a QR code to scan.</li>
            <li>Open it and choose a new password. It works once, within an hour.</li>
          </ol>
          <p className="text-sm text-muted-foreground">
            Gym owners: contact MatOS support for a new link.
          </p>
          <Button asChild variant="outline" className="h-11">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
