import { redirect } from "next/navigation";
import { DEFAULT_GYM_TIMEZONE } from "@matos/shared";
import { getCurrentMember } from "@/lib/auth/current-member";
import { createClient } from "@/lib/supabase/server";
import { SetupWizard } from "@/components/shared/setup-wizard";

// Stage O4 (matos_onboarding_plan.md §3.2): the owner's first-run guide.
// Outside the (coach) group on purpose — a focused, full-width flow without
// the nav shell. Owners of real gyms only; reachable any time from
// Settings ("Setup guide"), and where "/" sends an owner whose gym hasn't
// finished onboarding.
export default async function SetupPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  if (member.gymKind === "personal") redirect("/analysis");
  if (member.role !== "gym_owner") redirect(member.role === "athlete" ? "/home" : "/dashboard");

  const supabase = createClient();
  const { data: gym } = await supabase
    .from("gyms")
    .select("name, address, contact_email, timezone, onboarding_completed_at")
    .eq("id", member.gymId)
    .single();

  return (
    <SetupWizard
      firstName={member.firstName}
      currentMemberId={member.memberId}
      completed={Boolean(gym?.onboarding_completed_at)}
      gym={{
        name: gym?.name ?? "",
        address: gym?.address ?? "",
        contact_email: gym?.contact_email ?? "",
        timezone: gym?.timezone ?? DEFAULT_GYM_TIMEZONE,
      }}
    />
  );
}
