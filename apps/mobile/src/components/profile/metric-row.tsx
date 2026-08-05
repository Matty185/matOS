import { Text, View } from "react-native";
import { formatPct, formatRate, type MetricValue } from "@matos/shared";

// RN port of apps/web's profile-view.tsx MetricRow. Non-Negotiable #6:
// every metric renders its n — right next to the value, never behind a
// tooltip/expandable, so a 100% built on n=1 always reads as exactly that
// fragile.
export function MetricRow({
  label,
  metric,
  format = "pct",
  nUnit,
  last = false,
}: {
  label: string;
  metric: MetricValue;
  format?: "pct" | "rate";
  // Most metrics' n is a match or event count, self-evident from context.
  // scramblePctOfTime's denominator is total tagged seconds, not a count —
  // labeling it disambiguates "(n=180)" from looking like 180 matches.
  nUnit?: string;
  // Web's equivalent relies on CSS `last:border-b-0` (real `:last-child`
  // support); NativeWind's RN CSS runtime has no structural pseudo-class
  // support at all (verified against react-native-css-interop's actual
  // type/runtime surface — no nth-child/last-child anywhere), so `last:`
  // silently no-ops and every row keeps its bottom border, including the
  // true last one in a card (Stage M5 gate fix, code-reviewer). Callers
  // pass `last` explicitly for whichever row is genuinely the final
  // rendered child of its MetricGroup.
  last?: boolean;
}) {
  const formatted = format === "pct" ? formatPct(metric.value) : formatRate(metric.value);
  return (
    <View
      className={`flex-row items-center justify-between gap-3 py-2 ${last ? "" : "border-b border-neutral-100"}`}
    >
      <Text className="flex-1 font-sans text-sm text-neutral-600">{label}</Text>
      <Text className="font-sans-bold text-sm text-neutral-900">
        {formatted}{" "}
        <Text className="font-sans text-xs text-neutral-500">
          (n={metric.n}
          {nUnit ?? ""})
        </Text>
      </Text>
    </View>
  );
}
