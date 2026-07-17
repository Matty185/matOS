import { redirect } from "next/navigation";
import { Settings2 } from "lucide-react";
import { getCurrentMember } from "@/lib/auth/current-member";
import { EmptyState } from "@/components/shared/empty-state";

// Owner-only per plan §7 ("Gym settings (owner)") — the (coach) layout
// admits both coach and gym_owner, so this page adds its own narrower gate
// rather than the layout doing it for every route under it.
export default async function SettingsPage() {
  const member = await getCurrentMember();
  if (member?.role !== "gym_owner") redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Gym Settings</h1>
      <EmptyState
        icon={Settings2}
        title="Nothing to configure yet"
        description="Gym details, coach management, and GDPR tools land here in a later stage."
      />
    </div>
  );
}
