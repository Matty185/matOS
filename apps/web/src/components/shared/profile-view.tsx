"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Swords } from "lucide-react";
import { useAthleteProfile, type ProfileSubject } from "@/lib/analysis/use-athlete-profile";
import {
  formatPct,
  formatRate,
  humanize,
  formatVideoTimestamp,
  RESULT_LABELS,
  type AthleteProfile,
  type MetricValue,
} from "@matos/shared";
import { EmptyState } from "@/components/shared/empty-state";
import { ComparePickerDialog } from "@/components/shared/compare-picker-dialog";
import { MetricGroup } from "@/components/shared/metric-group";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Every metric renders its n (Non-Negotiable #6) — right next to the value,
// never hidden behind a tooltip, so a 100% built on n=1 always reads as
// exactly that fragile.
function MetricRow({
  label,
  metric,
  format = "pct",
  nUnit,
}: {
  label: string;
  metric: MetricValue;
  format?: "pct" | "rate";
  // Most metrics' n is a match or event count, self-evident from context.
  // scramblePctOfTime's denominator is total tagged seconds, not a count —
  // labeling it disambiguates "(n=180)" from looking like 180 matches.
  nUnit?: string;
}) {
  const formatted = format === "pct" ? formatPct(metric.value) : formatRate(metric.value);
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">
        {formatted}{" "}
        <span className="text-xs text-muted-foreground">
          (n={metric.n}
          {nUnit ?? ""})
        </span>
      </span>
    </div>
  );
}

function StyleCard({ style }: { style: AthleteProfile["style"] }) {
  const total = style.topSeconds + style.bottomSeconds + style.neutralSeconds;
  const topPct = total > 0 ? style.topSeconds / total : 0;
  const bottomPct = total > 0 ? style.bottomSeconds / total : 0;
  const neutralPct = total > 0 ? style.neutralSeconds / total : 0;
  const actionN = style.firstAction.n;

  return (
    <div className="flex flex-col gap-4 rounded-md border p-4">
      <p className="text-sm font-medium">Style</p>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Top/bottom time</span>
          <span>n={style.topBottomN}</span>
        </div>
        {total > 0 ? (
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className="bg-primary" style={{ width: `${topPct * 100}%` }} title="Top" />
            <div
              className="bg-muted-foreground/40"
              style={{ width: `${neutralPct * 100}%` }}
              title="Neutral"
            />
            <div
              className="bg-destructive/60"
              style={{ width: `${bottomPct * 100}%` }}
              title="Bottom"
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No position data yet.</p>
        )}
        {total > 0 ? (
          <p className="text-xs text-muted-foreground">
            Top {formatPct(topPct)} · Neutral {formatPct(neutralPct)} · Bottom{" "}
            {formatPct(bottomPct)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>First action</span>
          <span>n={actionN}</span>
        </div>
        {actionN > 0 ? (
          <p className="text-sm">
            Shoot {formatPct(style.firstAction.shoot / actionN)} · Pull{" "}
            {formatPct(style.firstAction.pull / actionN)} · Pulled on{" "}
            {formatPct(style.firstAction.pulledOn / actionN)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        )}
      </div>

      <MetricRow
        label="Scramble rate (per match)"
        metric={style.scrambleRatePerMatch}
        format="rate"
      />
      <MetricRow label="Scramble (% of position time)" metric={style.scramblePctOfTime} nUnit="s" />
    </div>
  );
}

function ProfileBody({ profile }: { profile: AthleteProfile }) {
  if (profile.matchCount === 0) {
    return (
      <EmptyState
        icon={Swords}
        title="No breakdowns logged for this ruleset yet."
        description="Log a match to start building this profile."
        actionLabel="Log a match"
        actionHref="/analysis/new"
      />
    );
  }

  const methodTotal = profile.general.finishMethodDistribution.reduce((sum, m) => sum + m.count, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border p-4">
        <p className="mb-2 text-sm font-medium">General</p>
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-3 border-b py-2 text-sm">
            <span className="text-muted-foreground">Matches logged</span>
            <span className="font-medium">{profile.matchCount}</span>
          </div>
          <div className="flex items-center justify-between gap-3 border-b py-2 text-sm">
            <span className="text-muted-foreground">Avg match time</span>
            <span className="font-medium">
              {profile.general.avgMatchTimeSeconds.value === null
                ? "—"
                : formatVideoTimestamp(profile.general.avgMatchTimeSeconds.value)}{" "}
              <span className="text-xs text-muted-foreground">
                (n={profile.general.avgMatchTimeSeconds.n})
              </span>
            </span>
          </div>
          <MetricRow label="Win rate" metric={profile.general.winRate} />
          {profile.general.finishMethodDistribution.length > 0 ? (
            <div className="flex flex-col gap-1 py-2 text-sm">
              <span className="text-muted-foreground">Method distribution</span>
              <p>
                {profile.general.finishMethodDistribution
                  .map(
                    (m) =>
                      `${humanize(m.method)} ${formatPct(m.pct)} (n=${m.count}/${methodTotal})`,
                  )
                  .join(" · ")}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <StyleCard style={profile.style} />

      <MetricGroup title="Wrestling">
        <MetricRow
          label="Takedown attempts / match"
          metric={profile.wrestling.takedownAttemptsPerMatch}
          format="rate"
        />
        <MetricRow label="Takedown success" metric={profile.wrestling.takedownSuccessPct} />
        <MetricRow label="Takedown defence" metric={profile.wrestling.takedownDefencePct} />
      </MetricGroup>

      <MetricGroup title="Passing">
        <MetricRow
          label="Pass attempts / match"
          metric={profile.passing.passAttemptsPerMatch}
          format="rate"
        />
        <MetricRow label="Pass success" metric={profile.passing.passSuccessPct} />
      </MetricGroup>

      <MetricGroup title="Guard">
        <MetricRow label="Sweep success" metric={profile.guard.sweepPct} />
        <MetricRow label="Retention" metric={profile.guard.retentionPct} />
        <MetricRow label="Wrestle-up success" metric={profile.guard.wrestleUpPct} />
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
        />
        {profile.submissions.topByFrequency.length > 0 ? (
          <div className="flex flex-col gap-1 py-2 text-sm">
            <span className="text-muted-foreground">Top submissions</span>
            {profile.submissions.topByFrequency.map((s) => (
              <div key={s.type} className="flex items-center justify-between">
                <span>{humanize(s.type)}</span>
                <span className="text-xs text-muted-foreground">
                  {formatPct(s.finishPct.value)} finish (n={s.finishPct.n})
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </MetricGroup>

      <MetricGroup title="Escapes">
        {profile.escapes.map((e) => (
          <MetricRow key={e.position} label={humanize(e.position)} metric={e.pct} />
        ))}
      </MetricGroup>

      <div className="rounded-md border p-4">
        <p className="mb-2 text-sm font-medium">Trajectory</p>
        <ul className="flex flex-col gap-2">
          {profile.trajectory.map((point) => (
            <li
              key={point.breakdownId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {format(new Date(point.matchDate), "MMM d, yyyy")}
                </span>
                {point.result ? (
                  <Badge variant="outline">{RESULT_LABELS[point.result]}</Badge>
                ) : null}
              </div>
              <span className="text-xs text-muted-foreground">
                {point.submissionAttempts} sub att · {point.takedownAttempts} TD att
                {point.topTimePct !== null ? ` · ${formatPct(point.topTimePct)} top` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ProfileView({ subject }: { subject: ProfileSubject }) {
  const { data, isLoading, error } = useAthleteProfile(subject);
  const [gi, setGi] = useState(true);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading profile...</p>;
  }
  if (error || !data) {
    return (
      <p className="text-sm text-destructive">Couldn&apos;t load this profile. Try refreshing.</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={gi ? "default" : "outline"}
            className="h-11"
            onClick={() => setGi(true)}
          >
            Gi
          </Button>
          <Button
            type="button"
            variant={!gi ? "default" : "outline"}
            className="h-11"
            onClick={() => setGi(false)}
          >
            No-Gi
          </Button>
        </div>
        <ComparePickerDialog subjectA={subject} />
      </div>
      <ProfileBody profile={gi ? data.gi : data.noGi} />
    </div>
  );
}
