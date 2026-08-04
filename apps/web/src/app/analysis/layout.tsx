import { redirect } from "next/navigation";
import { getCurrentMember, getUserGymMemberships } from "@/lib/auth/current-member";
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
//
// Stage S2 adds a third case: a personal-workspace member (role
// gym_owner, but gymKind 'personal') gets the "solo" variant — full
// coach nav (Members/Attendance/Classes/Payments/Audit Log) would be
// meaningless for a gym of one, and per the confirmed S2 scope decision,
// solo users land here (Analysis) as their functional home on web, with
// no agent (matos_mobile_plan.md: "Agent: Coach-only, web-only").
export default async function AnalysisLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();

  if (!member) redirect("/login");

  const isAthlete = member.role === "athlete";
  const isSolo = member.gymKind === "personal";
  const memberships = await getUserGymMemberships();

  return (
    <AppShell
      variant={isSolo ? "solo" : isAthlete ? "athlete" : "coach"}
      isOwner={member.role === "gym_owner"}
      memberName={`${member.firstName} ${member.lastName}`}
      roleLabel={isSolo ? "Personal workspace" : ROLE_LABEL[member.role]}
      memberships={memberships}
    >
      {children}
      {/* Agent is real-gym coach/owner-only — never rendered for athletes
          or solo (personal-workspace) users either. */}
      {!isAthlete && !isSolo ? <AgentChat /> : null}
    </AppShell>
  );
}
