// Match Analysis Module — Stage A5: athlete profile computation.
//
// Pure functions only, no DB access — same "fetch broadly, aggregate in
// JS" split as src/lib/payments/overdue.ts. CLAUDE.md's Match Analysis
// Module Non-Negotiable #6: "Profiles are computed, not authored. Gi/no-gi
// always separate. Every metric renders its n. Shown from n=1. Trajectory
// ordered by match_date, never created_at." At alpha scale (one gym, a
// bounded number of breakdowns per athlete) computing this in JS from a
// per-subject fetch is the same tradeoff overdue.ts and the dashboard
// already make — no materialised view, flagged to database-reviewer at
// this stage's gate per plan §4's own "decide at build" note.

export type BreakdownForProfile = {
  id: string;
  match_date: string;
  duration_seconds: number | null;
  result: "win" | "loss" | "draw" | null;
  method: "submission" | "points" | "decision" | "dq" | null;
};

export type PositionForProfile = {
  breakdown_id: string;
  position_name: string;
  role: string | null;
  start_ts: number;
  end_ts: number | null;
};

export type EventForProfile = {
  breakdown_id: string;
  event_name: string;
  modifier: string | null;
  outcome: string | null;
  ts: number;
};

export type MetricValue = { value: number | null; n: number };

function metric(numerator: number, denominator: number): MetricValue {
  return { value: denominator > 0 ? numerator / denominator : null, n: denominator };
}

// ── Position -> top/bottom/neutral classification ──────────────────────────
//
// Not derivable from the `positions` table's data today (roles are just
// strings, e.g. "playing"/"inside" — no "which side is this" column exists,
// and adding one is a schema change out of scope for a computation-only
// stage). This is a deliberate, narrow, code-level interpretation of the
// Stage A0 taxonomy — same category of provisional judgment call as A0's
// own "lock ambiguous items to something sensible now, coach reviews once
// built" choices (CLAUDE.md Decision Log, A0). If the coach review changes
// role semantics later, this map is the one place to update; the taxonomy
// data itself doesn't need to change for that.
type Side = "top" | "bottom" | "neutral";
const POSITION_SIDE: Record<string, Side | Record<string, Side>> = {
  standing_neutral: "neutral",
  closed_guard: { playing: "bottom", inside: "top" },
  half_guard: { bottom: "bottom", top: "top" },
  open_guard: { playing: "bottom", passing: "top" },
  side_control: { top: "top", bottom: "bottom" },
  mount: { top: "top", bottom: "bottom" },
  back_control: { has_back: "top", back_taken: "bottom" },
  turtle: { top: "top", turtled: "bottom" },
  leg_entanglement: { attacking: "top", defending: "bottom" },
  scramble: "neutral",
};

function sideOf(positionName: string, role: string | null): Side {
  const entry = POSITION_SIDE[positionName];
  if (entry === undefined) return "neutral";
  if (typeof entry === "string") return entry;
  return role !== null ? (entry[role] ?? "neutral") : "neutral";
}

const INFERIOR_POSITION_BUCKETS: { label: string; positionName: string; role: string }[] = [
  { label: "mount_bottom", positionName: "mount", role: "bottom" },
  { label: "back_taken", positionName: "back_control", role: "back_taken" },
  { label: "side_control_bottom", positionName: "side_control", role: "bottom" },
];

export type SubmissionBreakdown = { type: string; count: number; finishPct: MetricValue };

export type EscapeBreakdown = { position: string; pct: MetricValue };

export type MatchTrajectoryPoint = {
  breakdownId: string;
  matchDate: string;
  result: "win" | "loss" | "draw" | null;
  submissionAttempts: number;
  takedownAttempts: number;
  takedownSuccessPct: number | null;
  topTimePct: number | null;
};

export type AthleteProfile = {
  matchCount: number;
  general: {
    avgMatchTimeSeconds: MetricValue;
    winRate: MetricValue;
    finishMethodDistribution: { method: string; count: number; pct: number }[];
  };
  style: {
    topSeconds: number;
    bottomSeconds: number;
    neutralSeconds: number;
    topBottomN: number;
    firstAction: { pull: number; shoot: number; pulledOn: number; n: number };
    scrambleRatePerMatch: MetricValue;
    scramblePctOfTime: MetricValue;
  };
  wrestling: {
    takedownAttemptsPerMatch: MetricValue;
    takedownSuccessPct: MetricValue;
    takedownDefencePct: MetricValue;
  };
  passing: {
    passAttemptsPerMatch: MetricValue;
    passSuccessPct: MetricValue;
  };
  guard: {
    sweepPct: MetricValue;
    retentionPct: MetricValue;
    wrestleUpPct: MetricValue;
  };
  submissions: {
    attemptsPerMatch: MetricValue;
    finishPctOverall: MetricValue;
    topByFrequency: SubmissionBreakdown[];
    tapRateWhenAttacked: MetricValue;
  };
  escapes: EscapeBreakdown[];
  trajectory: MatchTrajectoryPoint[];
};

// First-action tendency (plan §4: "pull/shoot/pulled-on per match"). The
// taxonomy has no "opponent pulled guard on me" event (guard_pull is only
// ever the focus athlete's own action, per Non-Negotiable #2's
// perspective rule), so "pulled-on" is interpreted here as
// takedown_defended — the closest available event to "something happened
// to me at range" — rather than left unimplemented. Same provisional-lock
// posture as the POSITION_SIDE map above.
const FIRST_ACTION_EVENTS = ["guard_pull", "takedown_attempt", "takedown_defended"] as const;

function classifyFirstAction(name: string): "pull" | "shoot" | "pulledOn" | null {
  if (name === "guard_pull") return "pull";
  if (name === "takedown_attempt") return "shoot";
  if (name === "takedown_defended") return "pulledOn";
  return null;
}

// Stage M5: generalized out of apps/web's resolve-share-link.ts (which
// picked a primary gi/no-gi style for a *publicly resolved* share) so
// apps/mobile can apply the identical tie-break rule to its own
// authenticated profile fetch — a share card image only has room for one
// ruleset, same as a public share page does. Takes the two computed
// profiles directly rather than a share-resolution-specific type, since
// both callers already have exactly this shape on hand. A tie (including
// 0 vs 0) defaults to gi — arbitrary but deterministic.
export function pickPrimaryStyle(profiles: { gi: AthleteProfile; noGi: AthleteProfile }): {
  profile: AthleteProfile;
  label: "Gi" | "No-Gi";
} {
  return profiles.gi.matchCount >= profiles.noGi.matchCount
    ? { profile: profiles.gi, label: "Gi" }
    : { profile: profiles.noGi, label: "No-Gi" };
}

export function computeAthleteProfile(
  breakdowns: BreakdownForProfile[],
  positions: PositionForProfile[],
  events: EventForProfile[],
): AthleteProfile {
  const positionsByBreakdown = new Map<string, PositionForProfile[]>();
  for (const p of positions) {
    const list = positionsByBreakdown.get(p.breakdown_id);
    if (list) list.push(p);
    else positionsByBreakdown.set(p.breakdown_id, [p]);
  }
  const eventsByBreakdown = new Map<string, EventForProfile[]>();
  for (const e of events) {
    const list = eventsByBreakdown.get(e.breakdown_id);
    if (list) list.push(e);
    else eventsByBreakdown.set(e.breakdown_id, [e]);
  }

  // ── General ────────────────────────────────────────────────────────────
  const durations = breakdowns
    .map((b) => b.duration_seconds)
    .filter((d): d is number => d !== null);
  const avgMatchTimeSeconds = metric(
    durations.reduce((sum, d) => sum + d, 0),
    durations.length,
  );

  const decided = breakdowns.filter((b) => b.result !== null);
  const wins = decided.filter((b) => b.result === "win").length;
  const winRate = metric(wins, decided.length);

  const withMethod = breakdowns.filter((b) => b.method !== null);
  const methodCounts = new Map<string, number>();
  for (const b of withMethod) {
    const m = b.method;
    if (m === null) continue;
    methodCounts.set(m, (methodCounts.get(m) ?? 0) + 1);
  }
  const finishMethodDistribution = Array.from(methodCounts.entries()).map(([method, count]) => ({
    method,
    count,
    pct: count / withMethod.length,
  }));

  // ── Style ──────────────────────────────────────────────────────────────
  let topSeconds = 0;
  let bottomSeconds = 0;
  let neutralSeconds = 0;
  const matchesWithPositionTime = new Set<string>();
  let scrambleIntervalCount = 0;
  const matchesWithAnyPosition = new Set<string>();

  for (const p of positions) {
    matchesWithAnyPosition.add(p.breakdown_id);
    if (p.position_name === "scramble") scrambleIntervalCount += 1;
    // Open intervals (end_ts null, still being tagged) don't get a
    // duration guess — only closed intervals contribute to time totals,
    // so an in-progress breakdown's still-open tag never silently skews
    // the ratio with a made-up end point.
    if (p.end_ts === null) continue;
    const duration = p.end_ts - p.start_ts;
    matchesWithPositionTime.add(p.breakdown_id);
    const side = sideOf(p.position_name, p.role);
    if (side === "top") topSeconds += duration;
    else if (side === "bottom") bottomSeconds += duration;
    else neutralSeconds += duration;
  }
  const totalPositionSeconds = topSeconds + bottomSeconds + neutralSeconds;

  const firstAction = { pull: 0, shoot: 0, pulledOn: 0, n: 0 };
  for (const breakdownEvents of Array.from(eventsByBreakdown.values())) {
    const candidates = breakdownEvents
      .filter((e) => (FIRST_ACTION_EVENTS as readonly string[]).includes(e.event_name))
      .sort((a, b) => a.ts - b.ts);
    const first = candidates[0];
    if (!first) continue;
    const classification = classifyFirstAction(first.event_name);
    if (!classification) continue;
    firstAction[classification] += 1;
    firstAction.n += 1;
  }

  // Denominator is breakdowns.length, same as every other "/match" metric
  // (takedownAttemptsPerMatch, passAttemptsPerMatch, submissions'
  // attemptsPerMatch) — not matchesWithAnyPosition.size, which would give
  // this one metric alone a smaller, silently-diverging n whenever a
  // breakdown has events tagged but no positions (the tagging UX doesn't
  // require position tagging). Found in Stage A5 code review.
  const scrambleRatePerMatch = metric(scrambleIntervalCount, breakdowns.length);
  const scrambleSeconds = positions
    .filter((p) => p.position_name === "scramble" && p.end_ts !== null)
    .reduce((sum, p) => sum + (p.end_ts as number) - p.start_ts, 0);
  const scramblePctOfTime = metric(scrambleSeconds, totalPositionSeconds);

  // ── Wrestling ──────────────────────────────────────────────────────────
  const takedownAttempts = events.filter((e) => e.event_name === "takedown_attempt");
  const takedownAttemptsPerMatch = metric(takedownAttempts.length, breakdowns.length);
  const takedownSuccessPct = metric(
    takedownAttempts.filter((e) => e.outcome === "completed").length,
    takedownAttempts.length,
  );
  const takedownDefences = events.filter((e) => e.event_name === "takedown_defended");
  const takedownDefencePct = metric(
    takedownDefences.filter((e) => e.outcome === "stuffed").length,
    takedownDefences.length,
  );

  // ── Passing ────────────────────────────────────────────────────────────
  const passAttempts = events.filter((e) => e.event_name === "guard_pass_attempt");
  const passAttemptsPerMatch = metric(passAttempts.length, breakdowns.length);
  const passSuccessPct = metric(
    passAttempts.filter((e) => e.outcome === "completed").length,
    passAttempts.length,
  );

  // ── Guard ──────────────────────────────────────────────────────────────
  const sweepAttempts = events.filter((e) => e.event_name === "sweep_attempt");
  const sweepPct = metric(
    sweepAttempts.filter((e) => e.outcome === "completed").length,
    sweepAttempts.length,
  );
  // guard_retention IS "a pass faced" — its outcome (retained/passed) is
  // the pass-attempt's resolution from the guard player's perspective, so
  // the event's own total doubles as the denominator plan §4 calls
  // "passes faced" rather than needing a separate count.
  const retentions = events.filter((e) => e.event_name === "guard_retention");
  const retentionPct = metric(
    retentions.filter((e) => e.outcome === "retained").length,
    retentions.length,
  );
  const wrestleUps = events.filter((e) => e.event_name === "wrestle_up_attempt");
  const wrestleUpPct = metric(
    wrestleUps.filter((e) => e.outcome === "completed").length,
    wrestleUps.length,
  );

  // ── Submissions ────────────────────────────────────────────────────────
  const subAttempts = events.filter((e) => e.event_name === "submission_attempt");
  const attemptsPerMatch = metric(subAttempts.length, breakdowns.length);
  const finishPctOverall = metric(
    subAttempts.filter((e) => e.outcome === "finished").length,
    subAttempts.length,
  );
  const byType = new Map<string, EventForProfile[]>();
  for (const e of subAttempts) {
    if (!e.modifier) continue;
    const list = byType.get(e.modifier);
    if (list) list.push(e);
    else byType.set(e.modifier, [e]);
  }
  const topByFrequency: SubmissionBreakdown[] = Array.from(byType.entries())
    .map(([type, attempts]) => ({
      type,
      count: attempts.length,
      finishPct: metric(attempts.filter((e) => e.outcome === "finished").length, attempts.length),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const subDefences = events.filter((e) => e.event_name === "submission_defended");
  const tapRateWhenAttacked = metric(
    subDefences.filter((e) => e.outcome === "tapped").length,
    subDefences.length,
  );

  // ── Escapes ────────────────────────────────────────────────────────────
  const escapeEvents = events.filter((e) => e.event_name === "escape");
  const escapes: EscapeBreakdown[] = INFERIOR_POSITION_BUCKETS.map((bucket) => {
    let completed = 0;
    let total = 0;
    for (const escapeEvent of escapeEvents) {
      const breakdownPositions = positionsByBreakdown.get(escapeEvent.breakdown_id) ?? [];
      // The interval covering this escape's timestamp, per plan §3:
      // "position escaped from is read off the timeline, not tagged as a
      // modifier." The tagging flow's "next position tag closes the
      // previous interval" means an escape tagged right as the position
      // changes can share its exact timestamp with BOTH the closing
      // interval (end_ts === ts) and the freshly-opened one
      // (start_ts === ts) — found in Stage A5 database review: a plain
      // "latest start_ts wins" tie-break picked the newly-opened interval
      // in that case, silently dropping the escape from its metric
      // instead of crediting the one it actually escaped from. Closing
      // intervals are checked first for exactly this reason.
      const candidates = breakdownPositions.filter(
        (p) => p.start_ts <= escapeEvent.ts && (p.end_ts === null || escapeEvent.ts <= p.end_ts),
      );
      const covering =
        candidates.find((p) => p.end_ts === escapeEvent.ts) ??
        candidates.sort((a, b) => b.start_ts - a.start_ts)[0];
      if (
        !covering ||
        covering.position_name !== bucket.positionName ||
        covering.role !== bucket.role
      ) {
        continue;
      }
      total += 1;
      if (escapeEvent.outcome === "completed") completed += 1;
    }
    return { position: bucket.label, pct: metric(completed, total) };
  });

  // ── Trajectory (ordered by match_date, never created_at) ────────────────
  const trajectory: MatchTrajectoryPoint[] = [...breakdowns]
    // Secondary key (id) makes same-match_date ordering deterministic —
    // Postgres gives no row-order guarantee without an ORDER BY, so
    // Array.sort's stability alone doesn't fix same-day tournament
    // matches shuffling between requests. Found in Stage A5 database
    // review.
    .sort((a, b) => a.match_date.localeCompare(b.match_date) || a.id.localeCompare(b.id))
    .map((b) => {
      const breakdownEvents = eventsByBreakdown.get(b.id) ?? [];
      const breakdownPositions = positionsByBreakdown.get(b.id) ?? [];
      const tdAttempts = breakdownEvents.filter((e) => e.event_name === "takedown_attempt");
      const matchTop = breakdownPositions
        .filter((p) => p.end_ts !== null && sideOf(p.position_name, p.role) === "top")
        .reduce((sum, p) => sum + (p.end_ts as number) - p.start_ts, 0);
      const matchBottom = breakdownPositions
        .filter((p) => p.end_ts !== null && sideOf(p.position_name, p.role) === "bottom")
        .reduce((sum, p) => sum + (p.end_ts as number) - p.start_ts, 0);
      const matchTopBottomTotal = matchTop + matchBottom;
      return {
        breakdownId: b.id,
        matchDate: b.match_date,
        result: b.result,
        submissionAttempts: breakdownEvents.filter((e) => e.event_name === "submission_attempt")
          .length,
        takedownAttempts: tdAttempts.length,
        takedownSuccessPct:
          tdAttempts.length > 0
            ? tdAttempts.filter((e) => e.outcome === "completed").length / tdAttempts.length
            : null,
        topTimePct: matchTopBottomTotal > 0 ? matchTop / matchTopBottomTotal : null,
      };
    });

  return {
    matchCount: breakdowns.length,
    general: { avgMatchTimeSeconds, winRate, finishMethodDistribution },
    style: {
      topSeconds,
      bottomSeconds,
      neutralSeconds,
      topBottomN: matchesWithPositionTime.size,
      firstAction,
      scrambleRatePerMatch,
      scramblePctOfTime,
    },
    wrestling: { takedownAttemptsPerMatch, takedownSuccessPct, takedownDefencePct },
    passing: { passAttemptsPerMatch, passSuccessPct },
    guard: { sweepPct, retentionPct, wrestleUpPct },
    submissions: { attemptsPerMatch, finishPctOverall, topByFrequency, tapRateWhenAttacked },
    escapes,
    trajectory,
  };
}
