import { Text, View } from "react-native";
import { formatPct, type AthleteProfile } from "@matos/shared";
import { MetricRow } from "./metric-row";

// RN port of apps/web's profile-view.tsx StyleCard, including the
// top/neutral/bottom stacked bar (flex-proportioned Views here instead of
// CSS percentage widths).
export function StyleCard({ style }: { style: AthleteProfile["style"] }) {
  const total = style.topSeconds + style.bottomSeconds + style.neutralSeconds;
  const topPct = total > 0 ? style.topSeconds / total : 0;
  const bottomPct = total > 0 ? style.bottomSeconds / total : 0;
  const neutralPct = total > 0 ? style.neutralSeconds / total : 0;
  const actionN = style.firstAction.n;

  return (
    <View className="gap-4 rounded-md border border-neutral-200 p-4">
      <Text className="font-sans-bold text-sm text-neutral-900">Style</Text>

      <View className="gap-1.5">
        <View className="flex-row items-center justify-between">
          <Text className="font-sans text-xs text-neutral-500">Top/bottom time</Text>
          <Text className="font-sans text-xs text-neutral-500">n={style.topBottomN}</Text>
        </View>
        {total > 0 ? (
          <View className="h-3 w-full flex-row overflow-hidden rounded-full bg-neutral-100">
            <View className="bg-primary" style={{ flex: topPct }} />
            <View className="bg-neutral-400/40" style={{ flex: neutralPct }} />
            <View className="bg-red-600/60" style={{ flex: bottomPct }} />
          </View>
        ) : (
          <Text className="font-sans text-sm text-neutral-600">No position data yet.</Text>
        )}
        {total > 0 ? (
          <Text className="font-sans text-xs text-neutral-500">
            Top {formatPct(topPct)} · Neutral {formatPct(neutralPct)} · Bottom{" "}
            {formatPct(bottomPct)}
          </Text>
        ) : null}
      </View>

      <View className="gap-1">
        <View className="flex-row items-center justify-between">
          <Text className="font-sans text-xs text-neutral-500">First action</Text>
          <Text className="font-sans text-xs text-neutral-500">n={actionN}</Text>
        </View>
        {actionN > 0 ? (
          <Text className="font-sans text-sm text-neutral-900">
            Shoot {formatPct(style.firstAction.shoot / actionN)} · Pull{" "}
            {formatPct(style.firstAction.pull / actionN)} · Pulled on{" "}
            {formatPct(style.firstAction.pulledOn / actionN)}
          </Text>
        ) : (
          <Text className="font-sans text-sm text-neutral-600">No data yet.</Text>
        )}
      </View>

      <MetricRow
        label="Scramble rate (per match)"
        metric={style.scrambleRatePerMatch}
        format="rate"
      />
      <MetricRow
        label="Scramble (% of position time)"
        metric={style.scramblePctOfTime}
        nUnit="s"
        last
      />
    </View>
  );
}
