import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth/current-member";

// Middleware guarantees a session reaches this point (Stage 3: "/" was
// removed from the public allowlist, since there's now a real destination
// to send everyone to instead of a static placeholder).
//
// Stage S2: a personal-workspace member (gymKind 'personal') lands at
// /analysis regardless of role — checked before the role branch below,
// since a solo user's role is gym_owner (not athlete), which would
// otherwise resolve to /dashboard, a shell built for managing a real gym
// this account doesn't have.
export default async function RootPage() {
  const member = await getCurrentMember();

  if (!member) redirect("/login");
  if (member.gymKind === "personal") redirect("/analysis");
  redirect(member.role === "athlete" ? "/home" : "/dashboard");
}
