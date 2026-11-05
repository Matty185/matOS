import type { Metadata } from "next";
import { resolveTrialGym, trialSessions, type TrialSession } from "@/lib/trials/public";
import { TrialRequestForm } from "@/components/shared/trial-request-form";
import { signedGymLogo } from "@/lib/storage/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book a free trial",
  description: "Ask to try a class.",
  robots: { index: false, follow: false },
};

// Flow audit 9.1: the gym's public trial-request page. No sign-in; the gym
// comes only from the code in the URL. Shows the next two weeks of classes
// (names and times only) and a short form; nothing is booked, the gym
// follows up.
export default async function TrialPage({ params }: { params: { code: string } }) {
  const gym = await resolveTrialGym(params.code);
  if (!gym) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>This link isn&apos;t active</CardTitle>
            <CardDescription>
              The trial link may have been changed or turned off. Contact the academy directly to
              arrange a trial.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const logo = await signedGymLogo(gym.id).catch(() => null);

  let sessions: TrialSession[] = [];
  try {
    sessions = await trialSessions(gym);
  } catch {
    console.error("[trial] couldn't load sessions");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-start p-4 sm:justify-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
            <img src={logo.url} alt="" className="mb-2 h-16 w-auto max-w-[12rem] object-contain" />
          ) : null}
          <CardTitle className="font-heading text-3xl tracking-wide">{gym.name}</CardTitle>
          <CardDescription>
            Try a class for free. Tell us a little about yourself and which class you&apos;d like to
            try, and the academy will get back to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrialRequestForm code={params.code} sessions={sessions} />
        </CardContent>
      </Card>
    </main>
  );
}
