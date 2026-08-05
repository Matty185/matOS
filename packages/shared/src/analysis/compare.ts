import type { AthleteProfile, MetricValue } from "./profile";

// Stage M5: extracted out of apps/web's compare-view.tsx (where these two
// adapters turned AthleteProfile's non-MetricValue style fields into
// comparable rows) so apps/mobile's own comparison screen can reuse the
// exact same math rather than re-deriving it — the same "extract on second
// platform" pattern as the taxonomy types (Stage S0) and belt constants
// (Stage M1).

export function sideSplit(style: AthleteProfile["style"]): {
  top: MetricValue;
  bottom: MetricValue;
  neutral: MetricValue;
} {
  const total = style.topSeconds + style.bottomSeconds + style.neutralSeconds;
  return {
    top: { value: total > 0 ? style.topSeconds / total : null, n: style.topBottomN },
    bottom: { value: total > 0 ? style.bottomSeconds / total : null, n: style.topBottomN },
    neutral: { value: total > 0 ? style.neutralSeconds / total : null, n: style.topBottomN },
  };
}

export function firstActionSplit(firstAction: AthleteProfile["style"]["firstAction"]): {
  shoot: MetricValue;
  pull: MetricValue;
  pulledOn: MetricValue;
} {
  const n = firstAction.n;
  const rate = (count: number) => ({ value: n > 0 ? count / n : null, n });
  return {
    shoot: rate(firstAction.shoot),
    pull: rate(firstAction.pull),
    pulledOn: rate(firstAction.pulledOn),
  };
}
