import { redirect } from "next/navigation";
import { getCurrentMember, getUserGymMemberships } from "@/lib/auth/current-member";
import { homePathFor, isStaffRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shared/app-shell";
import { ROLE_LABEL } from "@/lib/constants/member-labels";

// Flow audit 8.2: the Family area — a parent's linked children. Open to a
// parent account (guardian role), and to any other member who has been
// linked as a parent (an athlete who trains, a coach). Everyone else goes
// home. Each role keeps its own navigation.
export default async function FamilyLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  if (member.gymKind === "personal") redirect("/analysis");

  const isGuardian = member.role === "guardian";
  if (!isGuardian) {
    const { count } = await createClient()
      .from("member_guardians")
      .select("id", { count: "exact", head: true })
      .eq("guardian_member_id", member.memberId);
    if ((count ?? 0) === 0) redirect(homePathFor(member.role));
  }

  const memberships = await getUserGymMemberships();
  const staff = isStaffRole(member.role);
  return (
    <AppShell
      variant={isGuardian ? "family" : staff ? "coach" : "athlete"}
      isOwner={member.role === "gym_owner"}
      hasFamily={!isGuardian}
      memberName={`${member.firstName} ${member.lastName}`}
      roleLabel={ROLE_LABEL[member.role]}
      memberships={memberships}
    >
      {children}
    </AppShell>
  );
}
