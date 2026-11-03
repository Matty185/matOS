import { HOLD_MAX_MONTHS, monthIndex } from "@matos/shared";

// Flow audit 2.4: how far back and forward a hold may reach, judged against
// the gym's calendar date. Back 12 months lets a coach record a hold after
// the fact (someone was injured and didn't pay); forward 12 months covers a
// planned trip. The span limit itself is in the schema and the DB.

export const HOLD_MONTHS_BACK = 12;
export const HOLD_MONTHS_AHEAD = 12;

/**
 * A user-facing message when the hold falls outside the window, else null.
 * checkStart: false when the start is fixed (editing an existing hold).
 */
export function holdWindowError(
  startMonth: string,
  endMonth: string,
  today: string,
  { checkStart = true }: { checkStart?: boolean } = {},
): string | null {
  const now = monthIndex(today.slice(0, 7));
  const start = monthIndex(startMonth);
  const end = monthIndex(endMonth);
  if (end < start) return "The last month can't be before the first.";
  if (end - start >= HOLD_MAX_MONTHS) return `A hold can be at most ${HOLD_MAX_MONTHS} months.`;
  if (checkStart && start < now - HOLD_MONTHS_BACK) {
    return `A hold can start at most ${HOLD_MONTHS_BACK} months ago.`;
  }
  if (end > now + HOLD_MONTHS_AHEAD) {
    return `A hold can run at most ${HOLD_MONTHS_AHEAD} months ahead.`;
  }
  return null;
}
