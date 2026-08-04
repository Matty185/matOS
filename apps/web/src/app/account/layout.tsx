import { redirect } from "next/navigation";
import { getCurrentMember, getUserGymMemberships } from "@/lib/auth/current-member";
import { AppShell } from "@/components/shared/app-shell";

// Stage S2: promoted out of (athlete) into a shared top-level route,
// mirroring /analysis/layout.tsx's own "reachable by more than one
// context" pattern — a personal-workspace user (role: gym_owner, not
// athlete) needs an account page too, and there is exactly one canonical
// "my account" URL rather than a near-duplicate solo-only copy. Real gym
// coaches/owners are still excluded (they use (coach)/settings instead,
// unchanged) — this only widens the gate to also admit personal-workspace
// members, not every role.
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();

  if (!member) redirect("/login");

  const isSolo = member.gymKind === "personal";
  if (member.role !== "athlete" && !isSolo) redirect("/dashboard");

  const memberships = await getUserGymMemberships();

  return (
    <AppShell
      variant={isSolo ? "solo" : "athlete"}
      memberName={`${member.firstName} ${member.lastName}`}
      roleLabel={isSolo ? "Personal workspace" : "Athlete"}
      memberships={memberships}
    >
      {children}
    </AppShell>
  );
}
