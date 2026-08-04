import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@matos/shared";

type Role = Database["public"]["Enums"]["member_role"];
type GymKind = Database["public"]["Enums"]["gym_kind"];

export type CurrentMember = {
  userId: string;
  memberId: string;
  gymId: string;
  gymKind: GymKind;
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
 * Resolves via the `public.current_member()` RPC (Stage S2 migration
 * 20260803120000) rather than a direct `members` query keyed only on
 * `user_id`. That direct-query pattern was correct back when
 * `members.user_id` was globally unique (at most one row per user); Stage
 * S1 relaxed that so an account can hold a personal-workspace membership
 * and a real gym membership at once, which made `.eq("user_id",
 * user.id).single()` ambiguous — PostgREST's `.single()` throws once more
 * than one row matches. `current_member()` delegates to the same
 * `memberships.is_current`-scoped resolution the S1 RLS helper functions
 * use, so this and every RLS policy agree on which membership is "the"
 * current one. It also folds in the deactivation check server-side
 * (`private.my_member_id()` filters on `members.active`), so the explicit
 * `.eq("active", true)` this file used to need here is now redundant with
 * what the RPC itself already enforces.
 */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: members } = await supabase.rpc("current_member");
  const member = members?.[0];

  if (!member) return null;

  return {
    userId: user.id,
    memberId: member.id,
    gymId: member.gym_id,
    gymKind: member.gym_kind,
    role: member.role,
    firstName: member.first_name,
    lastName: member.last_name,
  };
}

export type GymMembership = {
  gymId: string;
  gymName: string;
  gymKind: GymKind;
  role: Role;
  isCurrent: boolean;
};

/**
 * Every gym the caller has an *active* membership in (Stage S2's context
 * switcher) — deliberately not just the current one. Relies on
 * `gyms_select_member` (migration 20260803130000), which broadened
 * `gyms`'s SELECT policy specifically so this join can resolve gym names
 * for non-current memberships too; the older `gyms_select_own` only ever
 * allowed reading the current gym.
 *
 * `.eq("user_id", user.id)` is explicit here, not left to RLS alone:
 * `memberships_select_staff` (S1) deliberately lets a coach/owner read
 * *every* member's memberships row in their gym, not just their own —
 * "gym owner reads gym's," per the plan's own §2.4 wording. That's
 * correct RLS behavior for staff-management use cases, but it means this
 * query would silently return every coworker's membership row too
 * without this filter — caught live: a coach with several staff
 * colleagues saw a React "duplicate key" warning from the switcher
 * because several colleagues' rows all shared the same gym_id.
 */
export async function getUserGymMemberships(): Promise<GymMembership[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("memberships")
    .select("gym_id, role, is_current, gyms(name, kind)")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("is_current", { ascending: false });

  if (!data) return [];

  return data
    .filter((m): m is typeof m & { gyms: NonNullable<(typeof m)["gyms"]> } => m.gyms !== null)
    .map((m) => ({
      gymId: m.gym_id,
      gymName: m.gyms.name,
      gymKind: m.gyms.kind,
      role: m.role,
      isCurrent: m.is_current,
    }));
}
