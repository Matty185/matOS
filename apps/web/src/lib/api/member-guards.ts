import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@matos/shared";
import { apiError } from "@/lib/api/response";

type PostgrestLikeError = { code?: string; message?: string; hint?: string | null } | null;

export const LAST_OWNER_MESSAGE =
  "An academy needs at least one active owner. Make someone else an owner first.";

/**
 * Stage O1: maps the two DB-level member guards from migration
 * 20261030120000 to clean API errors instead of a generic 500.
 * - members_last_owner_guard (deferred, raised at commit): P0001, hint
 *   LAST_OWNER. Matched on the message too, in case the hint doesn't
 *   survive PostgREST's commit-time error path.
 * - enforce_staff_active_guard / role guards: 42501.
 * Returns null for anything else so the caller keeps its own fallback.
 */
export function mapMemberGuardError(error: PostgrestLikeError): Response | null {
  if (!error) return null;
  if (error.hint === "LAST_OWNER" || error.message?.includes("at least one active owner")) {
    return apiError(409, "LAST_OWNER", LAST_OWNER_MESSAGE);
  }
  if (error.code === "42501") {
    return apiError(403, "FORBIDDEN", "Only the academy owner can change staff accounts.");
  }
  return null;
}

/**
 * True when this member is the only active owner of their gym. Used as a
 * pre-check before flows with irreversible steps (GDPR erasure deletes the
 * auth user before the members update the DB guard would reject), so they
 * fail cleanly up front rather than half-way through.
 */
export async function isLastActiveOwner(
  client: SupabaseClient<Database>,
  memberId: string,
): Promise<boolean> {
  const { data: target } = await client
    .from("members")
    .select("gym_id, role, active")
    .eq("id", memberId)
    .single();
  if (!target || target.role !== "gym_owner" || !target.active) return false;

  const { count } = await client
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", target.gym_id)
    .eq("role", "gym_owner")
    .eq("active", true);
  return (count ?? 0) <= 1;
}
