import { Text, View } from "react-native";
import {
  formatPct,
  formatRate,
  formatVideoTimestamp,
  humanize,
  sideSplit,
  firstActionSplit,
  type AthleteProfile,
  type MetricValue,
} from "@matos/shared";
import { MetricGroup } from "./metric-group";

// RN port of apps/web's compare-view.tsx CompareBody/CompareRow. Covers
// every scalar MetricValue row ProfileBody renders except the free-form
// list metrics (method distribution, top submissions by type) and
// trajectory, which don't reduce to a single comparable row — those stay
// on each subject's own profile screen, same as web.
function formatVideoTimestampOrDash(value: number | null): string {
  return value === null ? "—" : formatVideoTimestamp(value);
}

function CompareRow({
  label,
  a,
  b,
  format = "pct",
  nUnit,
  last = false,
}: {
  label: string;
  a: MetricValue;
  b: MetricValue;
  format?: "pct" | "rate" | "duration";
  nUnit?: string;
  // See MetricRow's identical `last` prop for why — NativeWind's `last:`
  // variant has no structural pseudo-class support to back it (Stage M5
  // gate fix, code-reviewer).
  last?: boolean;
}) {
  const fmt =
    format === "pct" ? formatPct : format === "rate" ? formatRate : formatVideoTimestampOrDash;
  return (
    <View
      className={`flex-row items-center gap-2 py-2 ${last ? "" : "border-b border-neutral-100"}`}
    >
      <Text className="flex-1 font-sans text-sm text-neutral-600" numberOfLines={1}>
        {label}
      </Text>
      <View className="w-20 items-end">
        <Text className="font-sans-bold text-sm text-neutral-900">{fmt(a.value)}</Text>
        <Text className="font-sans text-xs text-neutral-500">
          n={a.n}
          {nUnit ?? ""}
        </Text>
      </View>
      <View className="w-20 items-end">
        <Text className="font-sans-bold text-sm text-neutral-900">{fmt(b.value)}</Text>
        <Text className="font-sans text-xs text-neutral-500">
          n={b.n}
          {nUnit ?? ""}
        </Text>
      </View>
    </View>
  );
}

export function CompareBody({
  nameA,
  nameB,
  profileA,
  profileB,
}: {
  nameA: string;
  nameB: string;
  profileA: AthleteProfile;
  profileB: AthleteProfile;
}) {
  if (profileA.matchCount === 0 && profileB.matchCount === 0) {
    return (
      <View className="rounded-md border border-dashed border-neutral-300 p-6">
        <Text className="text-center font-sans text-sm text-neutral-600">
          Neither has any breakdowns logged for this ruleset yet.
        </Text>
      </View>
    );
  }

  const sideA = sideSplit(profileA.style);
  const sideB = sideSplit(profileB.style);
  const firstA = firstActionSplit(profileA.style.firstAction);
  const firstB = firstActionSplit(profileB.style.firstAction);

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-2 px-1">
        <View className="flex-1" />
        <Text className="w-20 text-right font-sans-bold text-xs text-neutral-900" numberOfLines={1}>
          {nameA}
        </Text>
        <Text className="w-20 text-right font-sans-bold text-xs text-neutral-900" numberOfLines={1}>
          {nameB}
        </Text>
      </View>

      <MetricGroup title="General">
        <View className="flex-row items-center gap-2 border-b border-neutral-100 py-2">
          <Text className="flex-1 font-sans text-sm text-neutral-600">Matches logged</Text>
          <Text className="w-20 text-right font-sans-bold text-sm text-neutral-900">
            {profileA.matchCount}
          </Text>
          <Text className="w-20 text-right font-sans-bold text-sm text-neutral-900">
            {profileB.matchCount}
          </Text>
        </View>
        <CompareRow
          label="Avg match time"
          a={profileA.general.avgMatchTimeSeconds}
          b={profileB.general.avgMatchTimeSeconds}
          format="duration"
        />
        <CompareRow
          label="Win rate"
          a={profileA.general.winRate}
          b={profileB.general.winRate}
          last
        />
      </MetricGroup>

      <MetricGroup title="Style">
        <CompareRow label="Top time" a={sideA.top} b={sideB.top} />
        <CompareRow label="Bottom time" a={sideA.bottom} b={sideB.bottom} />
        <CompareRow label="Neutral time" a={sideA.neutral} b={sideB.neutral} />
        <CompareRow label="First action: shoot" a={firstA.shoot} b={firstB.shoot} />
        <CompareRow label="First action: pull" a={firstA.pull} b={firstB.pull} />
        <CompareRow label="First action: pulled on" a={firstA.pulledOn} b={firstB.pulledOn} />
        <CompareRow
          label="Scramble rate / match"
          a={profileA.style.scrambleRatePerMatch}
          b={profileB.style.scrambleRatePerMatch}
          format="rate"
        />
        <CompareRow
          label="Scramble (% of position time)"
          a={profileA.style.scramblePctOfTime}
          b={profileB.style.scramblePctOfTime}
          nUnit="s"
          last
        />
      </MetricGroup>

      <MetricGroup title="Wrestling">
        <CompareRow
          label="Takedown attempts / match"
          a={profileA.wrestling.takedownAttemptsPerMatch}
          b={profileB.wrestling.takedownAttemptsPerMatch}
          format="rate"
        />
        <CompareRow
          label="Takedown success"
          a={profileA.wrestling.takedownSuccessPct}
          b={profileB.wrestling.takedownSuccessPct}
        />
        <CompareRow
          label="Takedown defence"
          a={profileA.wrestling.takedownDefencePct}
          b={profileB.wrestling.takedownDefencePct}
          last
        />
      </MetricGroup>

      <MetricGroup title="Passing">
        <CompareRow
          label="Pass attempts / match"
          a={profileA.passing.passAttemptsPerMatch}
          b={profileB.passing.passAttemptsPerMatch}
          format="rate"
        />
        <CompareRow
          label="Pass success"
          a={profileA.passing.passSuccessPct}
          b={profileB.passing.passSuccessPct}
          last
        />
      </MetricGroup>

      <MetricGroup title="Guard">
        <CompareRow label="Sweep success" a={profileA.guard.sweepPct} b={profileB.guard.sweepPct} />
        <CompareRow
          label="Retention"
          a={profileA.guard.retentionPct}
          b={profileB.guard.retentionPct}
        />
        <CompareRow
          label="Wrestle-up success"
          a={profileA.guard.wrestleUpPct}
          b={profileB.guard.wrestleUpPct}
          last
        />
      </MetricGroup>

      <MetricGroup title="Submissions">
        <CompareRow
          label="Attempts / match"
          a={profileA.submissions.attemptsPerMatch}
          b={profileB.submissions.attemptsPerMatch}
          format="rate"
        />
        <CompareRow
          label="Finish rate (overall)"
          a={profileA.submissions.finishPctOverall}
          b={profileB.submissions.finishPctOverall}
        />
        <CompareRow
          label="Tap rate when attacked"
          a={profileA.submissions.tapRateWhenAttacked}
          b={profileB.submissions.tapRateWhenAttacked}
          last
        />
      </MetricGroup>

      <MetricGroup title="Escapes">
        {profileA.escapes.map((e, i) => (
          <CompareRow
            key={e.position}
            label={humanize(e.position)}
            a={e.pct}
            b={profileB.escapes[i]?.pct ?? { value: null, n: 0 }}
            last={i === profileA.escapes.length - 1}
          />
        ))}
      </MetricGroup>
    </View>
  );
}
