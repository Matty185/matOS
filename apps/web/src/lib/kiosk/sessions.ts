import "server-only";
import { unstable_noStore as noStore } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { addDaysToDate, sessionsOnDate, type SessionChange } from "@matos/shared";

export type KioskClass = {
  id: string;
  name: string;
  class_type: "gi" | "no_gi" | "comp" | "open_mat";
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
};

/**
 * Today's sessions for a kiosk's gym (flow audit 3.2 changes applied).
 * Service-role client, so every query is scoped to `gymId` here — RLS
 * doesn't apply. Throws on error: the kiosk fails closed rather than
 * offering a session that may have been cancelled.
 */
export async function kioskSessionsOn(gymId: string, date: string, classId?: string) {
  noStore();
  const supabase = createServiceRoleClient();
  let classQuery = supabase
    .from("classes")
    .select("id, name, class_type, day_of_week, start_time, duration_minutes")
    .eq("gym_id", gymId)
    .eq("active", true);
  if (classId) classQuery = classQuery.eq("id", classId);
  let changeQuery = supabase
    .from("class_session_changes")
    .select("id, class_id, session_date, kind, new_date, new_start_time, note")
    .eq("gym_id", gymId)
    .gte("session_date", addDaysToDate(date, -6))
    .lte("session_date", addDaysToDate(date, 6));
  if (classId) changeQuery = changeQuery.eq("class_id", classId);

  const [{ data: classes, error: classError }, { data: changes, error: changeError }] =
    await Promise.all([classQuery, changeQuery]);
  if (classError || changeError) throw classError ?? changeError;
  return sessionsOnDate<KioskClass>(
    (classes ?? []) as KioskClass[],
    (changes ?? []) as SessionChange[],
    date,
  );
}

/** "Niamh K." — enough to find yourself on a shared screen. */
export function kioskDisplayName(first: string, last: string): string {
  const initial = last.trim().charAt(0);
  return initial ? `${first.trim()} ${initial.toUpperCase()}.` : first.trim();
}
