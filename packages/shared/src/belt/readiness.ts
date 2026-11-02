import { ALL_BELTS, BELT_LABELS, type BeltColor } from "./constants";

/**
 * Promotion readiness (flow audit 5.3). Guidance only: a coach still decides.
 * Shared so every surface (promotions list, member profile, dashboard count,
 * athlete progress) agrees on who is "ready".
 *
 * The gym's rule is for **stripes** only. A belt change (from 4 stripes) is
 * always the coach's call: no attendance rule describes it, so it is never
 * flagged ready (gate review). Black belt degrees are out of scope.
 */

export type PromotionRule = {
  /** Classes since the last promotion; null = not a criterion. */
  classesPerStripe: number | null;
  /** Whole months since the last promotion; null = not a criterion. */
  monthsPerStripe: number | null;
};

export type ReadinessStatus = "ready" | "close" | "not_yet" | "not_applicable";

/** Why a member has no ready/close/not-yet status. */
export type NotApplicableReason = "black_belt" | "belt_change" | "no_rule";

export type Readiness = {
  status: ReadinessStatus;
  reason: NotApplicableReason | null;
  /** "Stripe 3", "Blue belt", "Next belt", or null for black belts. */
  nextStep: string | null;
  /** The rank to pre-fill when promoting, or null if there's no clear one. */
  suggested: { belt: BeltColor; stripes: number } | null;
  classesSince: number;
  monthsSince: number;
  /**
   * 0..1 progress for each criterion that applies, null when it doesn't: the
   * rule turns it off, or (months) the member is still on the starting rank
   * they were added with, whose date is their join date — not a promotion.
   */
  classesProgress: number | null;
  monthsProgress: number | null;
};

const ADULT_TRACK: BeltColor[] = ["white", "blue", "purple", "brown", "black"];
const KIDS_TRACK: BeltColor[] = ALL_BELTS.filter((b) => b !== "white" && !ADULT_TRACK.includes(b));

/**
 * The belt after `belt` on its own track, or null when it isn't clear:
 * after white a member goes to blue (adult) or grey/white (kid), and after
 * green/black a kid moves to the adult track by age — MatOS knows neither.
 */
export function nextBelt(belt: BeltColor): BeltColor | null {
  if (belt === "white") return null;
  const adult = ADULT_TRACK.indexOf(belt);
  if (adult >= 0) return ADULT_TRACK[adult + 1] ?? null;
  const kids = KIDS_TRACK.indexOf(belt);
  return kids >= 0 ? (KIDS_TRACK[kids + 1] ?? null) : null;
}

/**
 * Whole calendar months between two instants (floor), in UTC. A month is
 * complete on the same day-of-month, or on the last day of a shorter month
 * (31 Jan → 30 Apr is 3 months).
 */
export function wholeMonthsBetween(from: Date, to: Date): number {
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  const lastDayOfToMonth = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0),
  ).getUTCDate();
  if (to.getUTCDate() < from.getUTCDate() && to.getUTCDate() < lastDayOfToMonth) months -= 1;
  return Math.max(0, months);
}

/** At or above this share of every active criterion = "close". */
const CLOSE_AT = 0.75;

export function computeReadiness(input: {
  belt: BeltColor;
  stripes: number;
  lastPromotedAt: string | Date;
  /** True while the member is still on the rank they were added with. */
  lastIsInitial?: boolean;
  classesSince: number;
  rule: PromotionRule;
  now?: Date;
}): Readiness {
  const now = input.now ?? new Date();
  const monthsSince = wholeMonthsBetween(new Date(input.lastPromotedAt), now);
  const classesSince = input.classesSince;
  const base = { classesSince, monthsSince, classesProgress: null, monthsProgress: null };

  if (input.belt === "black") {
    return {
      ...base,
      status: "not_applicable",
      reason: "black_belt",
      nextStep: null,
      suggested: null,
    };
  }

  if (input.stripes >= 4) {
    const next = nextBelt(input.belt);
    return {
      ...base,
      status: "not_applicable",
      reason: "belt_change",
      nextStep: next ? `${BELT_LABELS[next]} belt` : "Next belt",
      suggested: next ? { belt: next, stripes: 0 } : null,
    };
  }

  const nextStep = `Stripe ${input.stripes + 1}`;
  const suggested = { belt: input.belt, stripes: input.stripes + 1 };
  const { classesPerStripe, monthsPerStripe } = input.rule;
  const classesProgress = classesPerStripe ? Math.min(1, classesSince / classesPerStripe) : null;
  const monthsProgress =
    monthsPerStripe && !input.lastIsInitial ? Math.min(1, monthsSince / monthsPerStripe) : null;
  const active = [classesProgress, monthsProgress].filter((p): p is number => p !== null);

  if (active.length === 0) {
    return {
      ...base,
      status: "not_applicable",
      reason: "no_rule",
      nextStep,
      suggested,
      classesProgress,
      monthsProgress,
    };
  }
  const status: ReadinessStatus = active.every((p) => p >= 1)
    ? "ready"
    : active.every((p) => p >= CLOSE_AT)
      ? "close"
      : "not_yet";

  return { ...base, status, reason: null, nextStep, suggested, classesProgress, monthsProgress };
}
