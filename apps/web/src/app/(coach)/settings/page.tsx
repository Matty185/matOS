import Link from "next/link";
import { redirect } from "next/navigation";
import { ListChecks } from "lucide-react";
import { DEFAULT_GYM_TIMEZONE } from "@matos/shared";
import { getCurrentMember } from "@/lib/auth/current-member";
import { createClient } from "@/lib/supabase/server";
import { GdprSection } from "@/components/shared/gdpr-section";
import { GymDetailsForm } from "@/components/shared/gym-details-form";
import { TeamManager } from "@/components/shared/team-manager";
import { KioskManager } from "@/components/shared/kiosk-manager";
import { PromotionRulesForm } from "@/components/shared/promotion-rules-form";
import { WaiverManager } from "@/components/shared/waiver-manager";
import { TrialLinkManager } from "@/components/shared/trial-link-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Owner-only per plan §7 ("Gym settings (owner)") — the (coach) layout
// admits both coach and gym_owner, so this page adds its own narrower gate
// rather than the layout doing it for every route under it.
//
// Stage O5: gym details + team management land here (previously a
// placeholder beside the Stage 8 GDPR section).
export default async function SettingsPage() {
  const member = await getCurrentMember();
  if (member?.role !== "gym_owner") redirect("/dashboard");

  const supabase = createClient();
  const { data: gym } = await supabase
    .from("gyms")
    .select(
      "name, address, contact_email, timezone, onboarding_completed_at, promotion_classes_per_stripe, promotion_months_per_stripe",
    )
    .eq("id", member.gymId)
    .single();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-3xl tracking-wide">Gym Settings</h1>
        <Button asChild variant="outline" className="h-11">
          <Link href="/setup">
            <ListChecks className="mr-2 h-4 w-4" />
            {gym?.onboarding_completed_at ? "Setup guide" : "Continue setup"}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gym</CardTitle>
          <CardDescription>How your gym appears to members, and its local time.</CardDescription>
        </CardHeader>
        <CardContent>
          <GymDetailsForm
            defaultValues={{
              name: gym?.name ?? "",
              address: gym?.address ?? "",
              contact_email: gym?.contact_email ?? "",
              timezone: gym?.timezone ?? DEFAULT_GYM_TIMEZONE,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Promotions</CardTitle>
          <CardDescription>When someone shows as ready for their next stripe.</CardDescription>
        </CardHeader>
        <CardContent>
          <PromotionRulesForm
            classesPerStripe={gym?.promotion_classes_per_stripe ?? null}
            monthsPerStripe={gym?.promotion_months_per_stripe ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>Owners and coaches who run the gym.</CardDescription>
        </CardHeader>
        <CardContent>
          <TeamManager currentMemberId={member.memberId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Free trial link</CardTitle>
          <CardDescription>A public link people use to ask for a trial class.</CardDescription>
        </CardHeader>
        <CardContent>
          <TrialLinkManager gymId={member.gymId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Waiver</CardTitle>
          <CardDescription>The liability waiver members sign before training.</CardDescription>
        </CardHeader>
        <CardContent>
          <WaiverManager />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Front-desk kiosk</CardTitle>
          <CardDescription>
            A tablet at the door where members tap their name to check in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KioskManager />
        </CardContent>
      </Card>

      <GdprSection />
    </div>
  );
}
