import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import {
  formatPct,
  formatVideoTimestamp,
  humanize,
  RESULT_LABELS,
  type AthleteProfile,
} from "@matos/shared";
import { MetricGroup } from "./metric-group";
import { MetricRow } from "./metric-row";
import { StyleCard } from "./style-card";

// RN port of apps/web's profile-view.tsx ProfileBody — same section order,
// same rows, same n-everywhere rule (Non-Negotiable #6). Takes an already
// gi/no-gi-selected AthleteProfile, same as web's own ProfileBody; the
// caller (the athlete/[id] screen, the external-person screen) owns the
// Gi/No-Gi toggle state, matching web's ProfileView.
export function ProfileBody({ profile }: { profile: AthleteProfile }) {
  const router = useRouter();

  if (profile.matchCount === 0) {
    return (
      <View className="items-center gap-2 rounded-md border border-dashed border-neutral-300 p-6">
        <Text className="font-sans-bold text-sm text-neutral-900">
          No breakdowns logged for this ruleset yet.
        </Text>
        <Text className="text-center font-sans text-sm text-neutral-600">
          Log a match to start building this profile.
        </Text>
        <Pressable
          onPress={() => router.push("/analysis/new")}
          className="mt-2 h-11 items-center justify-center rounded-md bg-primary px-4"
        >
          <Text className="font-sans-bold text-sm text-white">Log a match</Text>
        </Pressable>
      </View>
    );
  }

  const methodTotal = profile.general.finishMethodDistribution.reduce((sum, m) => sum + m.count, 0);

  return (
    <View className="gap-4">
      <View className="gap-2 rounded-md border border-neutral-200 p-4">
        <Text className="font-sans-bold text-sm text-neutral-900">General</Text>
        <View>
          <View className="flex-row items-center justify-between gap-3 border-b border-neutral-100 py-2">
            <Text className="font-sans text-sm text-neutral-600">Matches logged</Text>
            <Text className="font-sans-bold text-sm text-neutral-900">{profile.matchCount}</Text>
          </View>
          <View className="flex-row items-center justify-between gap-3 border-b border-neutral-100 py-2">
            <Text className="font-sans text-sm text-neutral-600">Avg match time</Text>
            <Text className="font-sans-bold text-sm text-neutral-900">
              {profile.general.avgMatchTimeSeconds.value === null
                ? "—"
                : formatVideoTimestamp(profile.general.avgMatchTimeSeconds.value)}{" "}
              <Text className="font-sans text-xs text-neutral-500">
                (n={profile.general.avgMatchTimeSeconds.n})
              </Text>
            </Text>
          </View>
          <MetricRow
            label="Win rate"
            metric={profile.general.winRate}
            last={profile.general.finishMethodDistribution.length === 0}
          />
          {profile.general.finishMethodDistribution.length > 0 ? (
            <View className="gap-1 py-2">
              <Text className="font-sans text-sm text-neutral-600">Method distribution</Text>
              <Text className="font-sans text-sm text-neutral-900">
                {profile.general.finishMethodDistribution
                  .map(
                    (m) =>
                      `${humanize(m.method)} ${formatPct(m.pct)} (n=${m.count}/${methodTotal})`,
                  )
                  .join(" · ")}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <StyleCard style={profile.style} />

      <MetricGroup title="Wrestling">
        <MetricRow
          label="Takedown attempts / match"
          metric={profile.wrestling.takedownAttemptsPerMatch}
          format="rate"
        />
        <MetricRow label="Takedown success" metric={profile.wrestling.takedownSuccessPct} />
        <MetricRow label="Takedown defence" metric={profile.wrestling.takedownDefencePct} last />
      </MetricGroup>

      <MetricGroup title="Passing">
        <MetricRow
          label="Pass attempts / match"
          metric={profile.passing.passAttemptsPerMatch}
          format="rate"
        />
        <MetricRow label="Pass success" metric={profile.passing.passSuccessPct} last />
      </MetricGroup>

      <MetricGroup title="Guard">
        <MetricRow label="Sweep success" metric={profile.guard.sweepPct} />
        <MetricRow label="Retention" metric={profile.guard.retentionPct} />
        <MetricRow label="Wrestle-up success" metric={profile.guard.wrestleUpPct} last />
      </MetricGroup>

      <MetricGroup title="Submissions">
        <MetricRow
          label="Attempts / match"
          metric={profile.submissions.attemptsPerMatch}
          format="rate"
        />
        <MetricRow label="Finish rate (overall)" metric={profile.submissions.finishPctOverall} />
        <MetricRow
          label="Tap rate when attacked"
          metric={profile.submissions.tapRateWhenAttacked}
          last={profile.submissions.topByFrequency.length === 0}
        />
        {profile.submissions.topByFrequency.length > 0 ? (
          <View className="gap-1 py-2">
            <Text className="font-sans text-sm text-neutral-600">Top submissions</Text>
            {profile.submissions.topByFrequency.map((s) => (
              <View key={s.type} className="flex-row items-center justify-between">
                <Text className="font-sans text-sm text-neutral-900">{humanize(s.type)}</Text>
                <Text className="font-sans text-xs text-neutral-500">
                  {formatPct(s.finishPct.value)} finish (n={s.finishPct.n})
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </MetricGroup>

      <MetricGroup title="Escapes">
        {profile.escapes.map((e, i) => (
          <MetricRow
            key={e.position}
            label={humanize(e.position)}
            metric={e.pct}
            last={i === profile.escapes.length - 1}
          />
        ))}
      </MetricGroup>

      <View className="gap-2 rounded-md border border-neutral-200 p-4">
        <Text className="font-sans-bold text-sm text-neutral-900">Trajectory</Text>
        <View className="gap-2">
          {profile.trajectory.map((point) => (
            <View
              key={point.breakdownId}
              className="flex-row flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 p-3"
            >
              <View className="flex-row items-center gap-2">
                <Text className="font-sans-bold text-sm text-neutral-900">
                  {format(new Date(point.matchDate), "MMM d, yyyy")}
                </Text>
                {point.result ? (
                  <View className="rounded-full border border-neutral-300 px-2 py-0.5">
                    <Text className="font-sans text-xs text-neutral-600">
                      {RESULT_LABELS[point.result]}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text className="font-sans text-xs text-neutral-500">
                {point.submissionAttempts} sub att · {point.takedownAttempts} TD att
                {point.topTimePct !== null ? ` · ${formatPct(point.topTimePct)} top` : ""}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
