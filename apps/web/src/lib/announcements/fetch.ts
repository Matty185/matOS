import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@matos/shared";
import type { AnnouncementView } from "@/components/shared/announcement-card";

/**
 * Flow audit 7.1: the gym's announcements still showing on `today` (gym
 * timezone), newest first. RLS scopes the read to the caller's active gym.
 * Throws on error so callers decide how to degrade.
 */
export async function fetchLiveAnnouncements(
  supabase: SupabaseClient<Database>,
  today: string,
): Promise<AnnouncementView[]> {
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, show_until, created_at")
    .gte("show_until", today)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return data ?? [];
}
