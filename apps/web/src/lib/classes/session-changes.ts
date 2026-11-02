import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysToDate, type Database, type SessionChange } from "@matos/shared";

const SESSION_CHANGE_COLUMNS =
  "id, class_id, session_date, kind, new_date, new_start_time, note" as const;

/**
 * Flow audit 3.2: the one-off class changes needed to resolve every session
 * listed between `from` and `to` (YYYY-MM-DD, inclusive). Moves reach up to
 * six days, so the session_date range is widened by six each side. RLS scopes
 * rows to the caller's gym. Throws on error: callers decide whether a failed
 * read should block (routes) or degrade (pages).
 */
export async function fetchSessionChanges(
  supabase: SupabaseClient<Database>,
  from: string,
  to: string,
  classId?: string,
): Promise<SessionChange[]> {
  let query = supabase
    .from("class_session_changes")
    .select(SESSION_CHANGE_COLUMNS)
    .gte("session_date", addDaysToDate(from, -6))
    .lte("session_date", addDaysToDate(to, 6));
  if (classId) query = query.eq("class_id", classId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
