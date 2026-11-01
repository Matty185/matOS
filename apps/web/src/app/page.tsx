import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth/current-member";
import { createClient } from "@/lib/supabase/server";

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

  // Stage O4: an owner of a freshly provisioned gym (setup not finished,
  // nothing in it yet) starts in the setup guide rather than an empty
  // dashboard. Once anything exists they land on the dashboard, where the
  // setup checklist carries on — so "Finish later" is never a loop.
  if (member.role === "gym_owner") {
    const supabase = createClient();
    const [{ data: gym }, { count: classCount }, { count: memberCount }] = await Promise.all([
      supabase.from("gyms").select("onboarding_completed_at").eq("id", member.gymId).single(),
      supabase.from("classes").select("id", { count: "exact", head: true }),
      supabase.from("members").select("id", { count: "exact", head: true }),
    ]);
    const fresh = (classCount ?? 0) === 0 && (memberCount ?? 0) <= 1;
    if (gym && !gym.onboarding_completed_at && fresh) redirect("/setup");
  }

  redirect(member.role === "athlete" ? "/home" : "/dashboard");
}
