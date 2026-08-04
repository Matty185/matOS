import { redirect } from "next/navigation";
import { getCurrentMember, getUserGymMemberships } from "@/lib/auth/current-member";
import { AppShell } from "@/components/shared/app-shell";

export default async function AthleteLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();

  if (!member) redirect("/login");
  if (member.role !== "athlete") redirect("/dashboard");

  const memberships = await getUserGymMemberships();

  return (
    <AppShell
      variant="athlete"
      memberName={`${member.firstName} ${member.lastName}`}
      roleLabel="Athlete"
      memberships={memberships}
    >
      {children}
    </AppShell>
  );
}
