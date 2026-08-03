import { redirect } from "next/navigation";
import { Settings2 } from "lucide-react";
import { getCurrentMember } from "@/lib/auth/current-member";
import { EmptyState } from "@/components/shared/empty-state";
import { GdprSection } from "@/components/shared/gdpr-section";

// Owner-only per plan §7 ("Gym settings (owner)") — the (coach) layout
// admits both coach and gym_owner, so this page adds its own narrower gate
// rather than the layout doing it for every route under it.
//
// Stage 8 scope is specifically "GDPR settings" per plan §10 row 8's own
// wording, not the full "gym details, logo, coach management, danger zone"
// list — those remain a later-stage placeholder.
export default async function SettingsPage() {
  const member = await getCurrentMember();
  if (member?.role !== "gym_owner") redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Gym Settings</h1>
      <EmptyState
        icon={Settings2}
        title="Nothing to configure yet"
        description="Gym details, logo, and coach management land here in a later stage."
      />
      <GdprSection />
    </div>
  );
}
