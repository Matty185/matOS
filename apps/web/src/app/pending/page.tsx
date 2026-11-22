import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth/current-member";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { CheckAgainButton } from "./check-again-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Someone who signed up with the academy's permanent join QR code, waiting
// for a coach to approve them. Their member row is inactive until then, so
// there's nothing else they can open.
export default async function PendingApprovalPage() {
  if (await getCurrentMember()) redirect("/");
  const { data } = await createClient().rpc("my_signup_status");
  const gymName = data?.[0]?.gym_name;
  if (!gymName) redirect("/login");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Clock className="mb-2 h-8 w-8 text-primary" aria-hidden="true" />
          <CardTitle>Waiting for approval</CardTitle>
          <CardDescription>
            Thanks for signing up to {gymName}. A coach checks new sign-ups. Once they approve you,
            press Check again, or sign in later with the email and password you just chose.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            In a hurry? Ask a coach at your next class.
          </p>
          <div className="flex flex-wrap gap-2">
            <CheckAgainButton />
            <SignOutButton className="h-11 w-fit" />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
