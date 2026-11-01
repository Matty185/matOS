import "server-only";
import { DEFAULT_GYM_TIMEZONE, type Database } from "@matos/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The gym's IANA timezone (Stage O1). Server code runs in UTC, so any
 * server-side "today" for a gym must come from here + gymWallClock(), never
 * from `new Date().toISOString().slice(0, 10)`.
 */
export async function getGymTimeZone(
  supabase: SupabaseClient<Database>,
  gymId: string,
): Promise<string> {
  const { data } = await supabase.from("gyms").select("timezone").eq("id", gymId).single();
  return data?.timezone ?? DEFAULT_GYM_TIMEZONE;
}
