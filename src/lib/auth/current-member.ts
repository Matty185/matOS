import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Role = Database["public"]["Enums"]["member_role"];

export type CurrentMember = {
  userId: string;
  memberId: string;
  gymId: string;
  role: Role;
  firstName: string;
  lastName: string;
};

/**
 * Server Component / layout equivalent of withAuth's session lookup —
 * middleware already guarantees a session exists for anything reaching a
 * page that uses this (everything except the public allowlist), so this
 * returns null only for the edge case of a session whose member row is
 * missing or deactivated.
 *
 * `.eq("active", true)` is explicit here rather than assumed from RLS:
 * found in Stage 4 security review that `members_select_self` (the policy
 * this query resolves through) checks only `user_id = auth.uid()`, not
 * `active` — unlike the `private.*()` helper functions other tables' RLS
 * routes through, which do filter on `active` (Stage 2 migration
 * 20260716130000). Without this, a deactivated coach/owner's still-valid
 * Auth session would pass (coach)/layout.tsx's role gate and reach the
 * dashboard shell — every actual read/write is still independently blocked
 * by RLS/withAuth, but "deactivated means no access" should hold at the
 * shell level too, not just the data level.
 */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: member } = await supabase
    .from("members")
    .select("id, gym_id, role, first_name, last_name")
    .eq("user_id", user.id)
    .eq("active", true)
    .single();

  if (!member) return null;

  return {
    userId: user.id,
    memberId: member.id,
    gymId: member.gym_id,
    role: member.role,
    firstName: member.first_name,
    lastName: member.last_name,
  };
}
