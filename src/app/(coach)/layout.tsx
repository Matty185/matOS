import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth/current-member";
import { AppShell } from "@/components/shared/app-shell";
import { AgentChat } from "@/components/shared/agent-chat";

const ROLE_LABEL = { gym_owner: "Owner", coach: "Coach", athlete: "Athlete" } as const;

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();

  // Middleware already guarantees a session for anything reaching this
  // layout; this is the role gate — an athlete has no business in the coach
  // area, and a missing member row (deactivated, RLS-filtered) means no
  // legitimate destination at all.
  if (!member) redirect("/login");
  if (member.role === "athlete") redirect("/home");

  return (
    <AppShell
      variant="coach"
      isOwner={member.role === "gym_owner"}
      memberName={`${member.firstName} ${member.lastName}`}
      roleLabel={ROLE_LABEL[member.role]}
    >
      {children}
      <AgentChat />
    </AppShell>
  );
}
