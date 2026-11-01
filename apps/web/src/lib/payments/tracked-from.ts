import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@matos/shared";

/**
 * Stage O6: the caller's current gym's `payments_tracked_from` (see
 * billableMembers in ./overdue). Resolved via current_member() — the same
 * current-gym resolution RLS uses — so it works from server components,
 * route handlers, the agent's tools and browser components alike, none of
 * which need to thread a gym id through. Null = no lower bound.
 */
export async function getPaymentsTrackedFrom(
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const { data: members } = await supabase.rpc("current_member");
  const gymId = members?.[0]?.gym_id;
  if (!gymId) return null;
  const { data: gym } = await supabase
    .from("gyms")
    .select("payments_tracked_from")
    .eq("id", gymId)
    .single();
  return gym?.payments_tracked_from ?? null;
}
