import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@matos/shared";

/**
 * Flow audit 8.2: the caller's link to a child, read under RLS
 * (member_guardians_select_guardian only returns the caller's own links)
 * plus the child's row (members_select_guardian). null when the caller isn't
 * this child's linked guardian — the routes treat that as "not found" so
 * they don't confirm which members exist. The DB policies on the write are
 * the real gate; this is for a clear error and the child's status.
 */
export async function loadLinkedChild(
  supabase: SupabaseClient<Database>,
  guardianMemberId: string,
  childMemberId: string,
) {
  const { data: link } = await supabase
    .from("member_guardians")
    .select("id")
    .eq("guardian_member_id", guardianMemberId)
    .eq("child_member_id", childMemberId)
    .maybeSingle();
  if (!link) return null;
  const { data: child } = await supabase
    .from("members")
    .select("id, first_name, last_name, active, gym_id")
    .eq("id", childMemberId)
    .maybeSingle();
  return child ?? null;
}
