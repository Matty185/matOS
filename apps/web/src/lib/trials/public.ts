import "server-only";
import { unstable_noStore as noStore } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  addDaysToDate,
  gymWallClock,
  sessionRuns,
  sessionsOnDate,
  DEFAULT_GYM_TIMEZONE,
  type ClassProgram,
  type SessionChange,
} from "@matos/shared";

// Flow audit 9.1: the public trial page and its submit route. The visitor
// has no account, so these use the service-role client (Rule 4, same
// category as sign-up links and the kiosk) and scope every query to the gym
// the code resolves to, never to anything else from the request. noStore():
// a code that's been turned off must stop working at once (Stage S3 lesson).

export const TRIAL_DAYS_AHEAD = 14;
const CODE_RE = /^[a-z0-9]{12,32}$/;

export type TrialGym = { id: string; name: string; timeZone: string };

/** The gym behind a public trial code, or null (off, unknown, inactive, personal). */
export async function resolveTrialGym(rawCode: string): Promise<TrialGym | null> {
  noStore();
  const code = rawCode.trim().toLowerCase();
  if (!CODE_RE.test(code)) return null;
  const { data } = await createServiceRoleClient()
    .from("gyms")
    .select("id, name, timezone, kind, active")
    .eq("trial_code", code)
    .maybeSingle();
  if (!data || data.kind !== "gym" || !data.active) return null;
  return { id: data.id, name: data.name, timeZone: data.timezone ?? DEFAULT_GYM_TIMEZONE };
}

export type TrialSession = {
  classId: string;
  date: string;
  startTime: string;
  name: string;
  classType: "gi" | "no_gi" | "comp" | "open_mat";
  program: ClassProgram;
  durationMinutes: number;
};

/**
 * Sessions a visitor can ask to try: the next TRIAL_DAYS_AHEAD days from the
 * gym's today, one-off changes applied, today's already-started ones left
 * out. Class names, times and programmes only (a gym's timetable is public
 * information); never coach names or anything about members.
 */
export async function trialSessions(gym: TrialGym): Promise<TrialSession[]> {
  noStore();
  const supabase = createServiceRoleClient();
  const now = gymWallClock(new Date(), gym.timeZone);
  const last = addDaysToDate(now.date, TRIAL_DAYS_AHEAD - 1);
  const [{ data: classes, error: ce }, { data: changes, error: he }] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, class_type, program, day_of_week, start_time, duration_minutes")
      .eq("gym_id", gym.id)
      .eq("active", true),
    supabase
      .from("class_session_changes")
      .select("id, class_id, session_date, kind, new_date, new_start_time, note")
      .eq("gym_id", gym.id)
      .gte("session_date", addDaysToDate(now.date, -6))
      .lte("session_date", addDaysToDate(last, 6)),
  ]);
  if (ce || he) throw ce ?? he;

  const out: TrialSession[] = [];
  for (let i = 0; i < TRIAL_DAYS_AHEAD; i++) {
    const date = addDaysToDate(now.date, i);
    for (const s of sessionsOnDate(classes ?? [], (changes ?? []) as SessionChange[], date)) {
      if (!sessionRuns(s.status)) continue;
      const [h, m] = s.startTime.split(":").map(Number);
      if (i === 0 && (h ?? 0) * 60 + (m ?? 0) <= now.minutesOfDay) continue;
      out.push({
        classId: s.classRow.id,
        date,
        startTime: s.startTime.slice(0, 5),
        name: s.classRow.name,
        classType: s.classRow.class_type,
        program: s.classRow.program,
        durationMinutes: s.classRow.duration_minutes,
      });
    }
  }
  return out;
}
