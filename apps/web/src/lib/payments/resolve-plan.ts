import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@matos/shared";

type PlanKind = Database["public"]["Enums"]["membership_plan"];

/**
 * Flow audit 6.7: checks a plan_id from a request against the caller's gym
 * (RLS limits gym_plans to it) and returns its billing type. `allowInactive`
 * keeps a member on a retired plan they already have. The members_plan_sync
 * trigger enforces the same rules in the database.
 */
export async function resolvePlan(
  supabase: SupabaseClient<Database>,
  gymId: string,
  planId: string,
  allowInactive = false,
): Promise<{ ok: true; kind: PlanKind } | { ok: false }> {
  const { data } = await supabase
    .from("gym_plans")
    .select("kind, active")
    .eq("id", planId)
    .eq("gym_id", gymId)
    .maybeSingle();
  if (!data || (!data.active && !allowInactive)) return { ok: false };
  return { ok: true, kind: data.kind };
}
