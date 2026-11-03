import { redirect } from "next/navigation";
import { homePathFor } from "@/lib/auth/roles";
import { getCurrentMember, getUserGymMemberships } from "@/lib/auth/current-member";
import { AppShell } from "@/components/shared/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function AthleteLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();

  if (!member) redirect("/login");
  if (member.role !== "athlete") redirect(homePathFor(member.role));

  const memberships = await getUserGymMemberships();
  // Flow audit 8.2: a parent who also trains gets the Family page too.
  const { count: childCount } = await createClient()
    .from("member_guardians")
    .select("id", { count: "exact", head: true })
    .eq("guardian_member_id", member.memberId);

  return (
    <AppShell
      variant="athlete"
      hasFamily={(childCount ?? 0) > 0}
      memberName={`${member.firstName} ${member.lastName}`}
      roleLabel="Athlete"
      memberships={memberships}
    >
      {children}
    </AppShell>
  );
}
