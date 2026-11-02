// Stage O1 — wall-clock time in a gym's own IANA timezone (gyms.timezone).
//
// Server code runs in UTC (Vercel), and `Date#getDay()/getHours()` silently
// answer in whatever zone the process happens to be in. Every "which day is
// it / is the class window open / what's today's date" decision about a
// gym goes through here instead. Intl only — no date-fns-tz dependency, and
// safe in both Node and React Native (Hermes ships Intl with timeZone).

export const DEFAULT_GYM_TIMEZONE = "Europe/Dublin";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type GymWallClock = {
  /** YYYY-MM-DD in the gym's zone — matches attendance.checked_in_date. */
  date: string;
  /** 0 = Sunday, matching classes.day_of_week. */
  dayOfWeek: number;
  /** Minutes since local midnight, for comparing against classes.start_time. */
  minutesOfDay: number;
};

export function gymWallClock(instant: Date, timeZone: string): GymWallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    dayOfWeek: WEEKDAY_INDEX[get("weekday")] ?? 0,
    minutesOfDay: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** "HH:MM[:SS]" (classes.start_time) → minutes since midnight. */
export function timeStringToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** True for IANA zone names this runtime understands. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The instant at which the gym's wall clock reads `date` (YYYY-MM-DD) at
 * `time` ("HH:MM[:SS]"). Used to stamp a coach-marked attendance at the
 * class's real start time in the gym's zone, whatever the coach's device
 * zone is. Two correction passes settle any DST offset; on a spring-forward
 * gap (a wall time that doesn't exist) it lands within the hour, which is
 * fine for attendance.
 */
export function gymLocalToInstant(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const target = Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1) + timeStringToMinutes(time) * 60_000;
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const wall = gymWallClock(new Date(guess), timeZone);
    const [wy, wmo, wd] = wall.date.split("-").map(Number);
    const wallAsUtc = Date.UTC(wy ?? 1970, (wmo ?? 1) - 1, wd ?? 1) + wall.minutesOfDay * 60_000;
    guess -= wallAsUtc - target;
  }
  return new Date(guess);
}
