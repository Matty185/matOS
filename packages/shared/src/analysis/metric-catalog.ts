import type { AthleteProfile, MetricValue } from "./profile";

const ZERO: MetricValue = { value: null, n: 0 };

function escapeMetric(bucket: string) {
  return (p: AthleteProfile): MetricValue =>
    p.escapes.find((e) => e.position === bucket)?.pct ?? ZERO;
}

// Single source of truth for the agent's get_metric tool — its input
// schema's `metric_name` enum (tools.ts) and its executor (read-tools.ts)
// both read from METRIC_NAMES/METRIC_CATALOG rather than each keeping an
// independent list, so the two can't silently drift apart the way a
// hand-copied enum elsewhere in the codebase could.
export const METRIC_CATALOG: Record<
  string,
  { label: string; get: (profile: AthleteProfile) => MetricValue }
> = {
  win_rate: { label: "Win rate", get: (p) => p.general.winRate },
  avg_match_time_seconds: {
    label: "Average match time (seconds)",
    get: (p) => p.general.avgMatchTimeSeconds,
  },
  takedown_attempts_per_match: {
    label: "Takedown attempts per match",
    get: (p) => p.wrestling.takedownAttemptsPerMatch,
  },
  takedown_success_pct: {
    label: "Takedown success rate",
    get: (p) => p.wrestling.takedownSuccessPct,
  },
  takedown_defence_pct: {
    label: "Takedown defence rate",
    get: (p) => p.wrestling.takedownDefencePct,
  },
  pass_attempts_per_match: {
    label: "Guard pass attempts per match",
    get: (p) => p.passing.passAttemptsPerMatch,
  },
  pass_success_pct: { label: "Guard pass success rate", get: (p) => p.passing.passSuccessPct },
  sweep_pct: { label: "Sweep success rate", get: (p) => p.guard.sweepPct },
  retention_pct: { label: "Guard retention rate", get: (p) => p.guard.retentionPct },
  wrestle_up_pct: { label: "Wrestle-up success rate", get: (p) => p.guard.wrestleUpPct },
  submission_attempts_per_match: {
    label: "Submission attempts per match",
    get: (p) => p.submissions.attemptsPerMatch,
  },
  submission_finish_pct: {
    label: "Submission finish rate (overall)",
    get: (p) => p.submissions.finishPctOverall,
  },
  tap_rate_when_attacked: {
    label: "Tap rate when attacked",
    get: (p) => p.submissions.tapRateWhenAttacked,
  },
  scramble_rate_per_match: {
    label: "Scramble rate per match",
    get: (p) => p.style.scrambleRatePerMatch,
  },
  scramble_pct_of_time: {
    label: "Scramble (% of tagged position time)",
    get: (p) => p.style.scramblePctOfTime,
  },
  escape_pct_mount_bottom: {
    label: "Escape rate from bottom mount",
    get: escapeMetric("mount_bottom"),
  },
  escape_pct_back_taken: {
    label: "Escape rate when back is taken",
    get: escapeMetric("back_taken"),
  },
  escape_pct_side_control_bottom: {
    label: "Escape rate from bottom side control",
    get: escapeMetric("side_control_bottom"),
  },
};

export const METRIC_NAMES = Object.keys(METRIC_CATALOG);
