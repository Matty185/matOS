import { redirect } from "next/navigation";
import { homePathFor, isStaffRole } from "@/lib/auth/roles";
import { getCurrentMember, getUserGymMemberships } from "@/lib/auth/current-member";
import { AppShell } from "@/components/shared/app-shell";
import { createClient } from "@/lib/supabase/server";
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
  // Staff only: athletes and parents (guardian role) have their own areas.
  if (!isStaffRole(member.role)) redirect(homePathFor(member.role));
  if (member.gymKind === "personal") redirect("/analysis");

  const memberships = await getUserGymMemberships();
  // Flow audit 8.2: staff who are also a child's parent get Family too.
  const { count: childCount } = await createClient()
    .from("member_guardians")
    .select("id", { count: "exact", head: true })
    .eq("guardian_member_id", member.memberId);

  return (
    <AppShell
      variant="coach"
      isOwner={member.role === "gym_owner"}
      hasFamily={(childCount ?? 0) > 0}
      memberName={`${member.firstName} ${member.lastName}`}
      roleLabel={ROLE_LABEL[member.role]}
      memberships={memberships}
    >
      {children}
      <AgentChat />
    </AppShell>
  );
}
