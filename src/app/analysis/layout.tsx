import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth/current-member";
import { AppShell } from "@/components/shared/app-shell";
import { AgentChat } from "@/components/shared/agent-chat";
import { ROLE_LABEL } from "@/lib/constants/member-labels";

// The Match Analysis Module's "top-level nav, all users" requirement
// (CLAUDE.md, plan §6) is the first route in this app reachable by both
// (athlete) and (coach) — every other route belongs exclusively to one
// role's route group with a mutually-exclusive redirect gate. This layout
// only checks "signed in, active member" (matching getCurrentMember's own
// role-agnostic contract) and picks AppShell's variant/AgentChat presence
// from the actual role, rather than living inside either existing group.
export default async function AnalysisLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();

  if (!member) redirect("/login");

  const isAthlete = member.role === "athlete";

  return (
    <AppShell
      variant={isAthlete ? "athlete" : "coach"}
      isOwner={member.role === "gym_owner"}
      memberName={`${member.firstName} ${member.lastName}`}
      roleLabel={ROLE_LABEL[member.role]}
    >
      {children}
      {/* Agent is coach/owner-only, matching (coach)/layout.tsx — never
          rendered in the athlete layout either. */}
      {!isAthlete ? <AgentChat /> : null}
    </AppShell>
  );
}
