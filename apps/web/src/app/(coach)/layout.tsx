import { redirect } from "next/navigation";
import { getCurrentMember, getUserGymMemberships } from "@/lib/auth/current-member";
import { AppShell } from "@/components/shared/app-shell";
import { AgentChat } from "@/components/shared/agent-chat";
import { ROLE_LABEL } from "@/lib/constants/member-labels";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();

  // Middleware already guarantees a session for anything reaching this
  // layout; this is the role gate — an athlete has no business in the coach
  // area, and a missing member row (deactivated, RLS-filtered) means no
  // legitimate destination at all. Stage S2: a personal-workspace member
  // is role gym_owner (per the plan: "personal workspaces are gyms of one
  // with owner = the user"), which would otherwise pass this gate and land
  // in the full coach shell — Members/Attendance/Classes/Payments/Audit
  // Log all meaningless for a gym of one. Solo users belong at /analysis
  // (their functional home, per the confirmed S2 scope), not here.
  if (!member) redirect("/login");
  if (member.role === "athlete") redirect("/home");
  if (member.gymKind === "personal") redirect("/analysis");

  const memberships = await getUserGymMemberships();

  return (
    <AppShell
      variant="coach"
      isOwner={member.role === "gym_owner"}
      memberName={`${member.firstName} ${member.lastName}`}
      roleLabel={ROLE_LABEL[member.role]}
      memberships={memberships}
    >
      {children}
      <AgentChat />
    </AppShell>
  );
}
