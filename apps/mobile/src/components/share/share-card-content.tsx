import { Text, View } from "react-native";
import { format } from "date-fns";
import {
  formatPct,
  formatRate,
  humanize,
  pickPrimaryStyle,
  RESULT_LABELS,
  METHOD_LABELS,
  type AthleteProfile,
  type MetricValue,
  type Database,
} from "@matos/shared";

type BeltColor = Database["public"]["Enums"]["belt_color"];

export type ProfileShareCardData = {
  kind: "profile";
  displayName: string;
  belt: BeltColor | null;
  stripes: number | null;
  gi: AthleteProfile;
  noGi: AthleteProfile;
};

export type BreakdownShareCardData = {
  kind: "breakdown";
  name: string;
  matchDate: string;
  gi: boolean;
  result: "win" | "loss" | "draw" | null;
  method: "submission" | "points" | "decision" | "dq" | null;
  focusDisplayName: string;
};

export type ShareCardData = ProfileShareCardData | BreakdownShareCardData;

// Exactly 9:16 (matches the 1080x1920 output resolution ShareSheetModal
// captures at — react-native-view-shot's width/height options resize the
// output regardless of source aspect ratio, so a mismatched ratio here
// would stretch/distort the captured image).
const CARD_WIDTH = 342;
const CARD_HEIGHT = 608;

// A social "poster" image, not a screenshot of an app screen — full-bleed
// navy (matching apps/web's own opengraph-image.tsx brand color, #0B1B33)
// rather than a white card floating on a background, since that's the
// visual language IG/TikTok Stories sharing actually expects. Content
// mirrors web's public ProfileCard/BreakdownCard (share/[token]/page.tsx)
// closely but isn't a pixel port — portrait has far more room than the
// 1200x630 OG image, so this leans on that room rather than cropping web's
// layout down. Rendered off-screen at CARD_WIDTH/CARD_HEIGHT and captured
// at a fixed higher output resolution by the caller (react-native-view-shot
// resizes independent of source view size) — this component never appears
// in the visible layout itself.
function StatLine({
  label,
  metric,
  format: fmt = "pct",
}: {
  label: string;
  metric: MetricValue;
  format?: "pct" | "rate";
}) {
  const formatted = fmt === "pct" ? formatPct(metric.value) : formatRate(metric.value);
  return (
    <View className="flex-row items-baseline justify-between border-b border-white/15 py-2">
      <Text className="font-sans text-sm text-white/70">{label}</Text>
      <Text className="font-sans-bold text-base text-white">
        {formatted} <Text className="font-sans text-xs text-white/50">(n={metric.n})</Text>
      </Text>
    </View>
  );
}

function ProfileCardContent({ data }: { data: ProfileShareCardData }) {
  const { profile: stats, label: styleLabel } = pickPrimaryStyle({ gi: data.gi, noGi: data.noGi });

  return (
    <View
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
      className="justify-between bg-primary p-6"
    >
      <View className="gap-4">
        <Text className="font-heading text-xl tracking-wide text-white">MatOS</Text>
        <View className="gap-1">
          <Text className="font-heading text-3xl tracking-wide text-white">{data.displayName}</Text>
          {data.belt ? (
            <Text className="font-sans text-sm text-white/70">
              {humanize(data.belt)} belt
              {data.stripes ? ` · ${data.stripes} stripe${data.stripes === 1 ? "" : "s"}` : ""}
            </Text>
          ) : null}
          <Text className="font-sans text-sm text-white/70">
            {stats.matchCount} {stats.matchCount === 1 ? "match" : "matches"} logged · {styleLabel}
          </Text>
        </View>

        <View>
          <StatLine label="Win rate" metric={stats.general.winRate} />
          <StatLine
            label="Submission attempts / match"
            metric={stats.submissions.attemptsPerMatch}
            format="rate"
          />
          <StatLine label="Submission finish rate" metric={stats.submissions.finishPctOverall} />
          <StatLine label="Takedown success" metric={stats.wrestling.takedownSuccessPct} />
          <StatLine label="Sweep %" metric={stats.guard.sweepPct} />
        </View>

        {stats.submissions.topByFrequency.length > 0 ? (
          <View className="gap-2">
            <Text className="font-sans text-xs text-white/60">Top submissions</Text>
            <View className="flex-row flex-wrap gap-1.5">
              {stats.submissions.topByFrequency.slice(0, 3).map((s) => (
                <View key={s.type} className="rounded-full border border-white/30 px-2.5 py-1">
                  <Text className="font-sans text-xs text-white">
                    {humanize(s.type)} ({s.count})
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      <Text className="text-center font-sans text-xs text-white/50">Tracked with MatOS</Text>
    </View>
  );
}

function BreakdownCardContent({ data }: { data: BreakdownShareCardData }) {
  return (
    <View
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
      className="justify-between bg-primary p-6"
    >
      <View className="gap-4">
        <Text className="font-heading text-xl tracking-wide text-white">MatOS</Text>
        <View className="gap-1">
          <Text className="font-heading text-3xl tracking-wide text-white">{data.name}</Text>
          <Text className="font-sans text-sm text-white/70">
            {data.focusDisplayName} · {format(new Date(data.matchDate), "MMM d, yyyy")}
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-1.5">
          <View className="rounded-full border border-white/30 px-2.5 py-1">
            <Text className="font-sans text-xs text-white">{data.gi ? "Gi" : "No-Gi"}</Text>
          </View>
          {data.result ? (
            <View className="rounded-full border border-white/30 px-2.5 py-1">
              <Text className="font-sans text-xs text-white">{RESULT_LABELS[data.result]}</Text>
            </View>
          ) : null}
          {data.method ? (
            <View className="rounded-full border border-white/30 px-2.5 py-1">
              <Text className="font-sans text-xs text-white">{METHOD_LABELS[data.method]}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text className="text-center font-sans text-xs text-white/50">Tracked with MatOS</Text>
    </View>
  );
}

export function ShareCardContent({ data }: { data: ShareCardData }) {
  return data.kind === "profile" ? (
    <ProfileCardContent data={data} />
  ) : (
    <BreakdownCardContent data={data} />
  );
}
