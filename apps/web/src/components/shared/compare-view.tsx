"use client";

import { useState } from "react";
import { useAthleteProfile, type ProfileSubject } from "@/lib/analysis/use-athlete-profile";
import {
  formatPct,
  formatRate,
  humanize,
  formatVideoTimestamp,
  sideSplit,
  firstActionSplit,
  type AthleteProfile,
  type MetricValue,
} from "@matos/shared";
import { MetricGroup } from "@/components/shared/metric-group";
import { Button } from "@/components/ui/button";

// Plan §6: "'Compare' action -> pick second athlete/external person ->
// side-by-side." §4: "Comparison view: two profiles rendered side-by-side,
// same metric rows." Covers every scalar MetricValue row ProfileBody
// renders (Stage A6 code review caught an earlier pass that computed
// first-action's "pulled on" value and two other scalar rows but never
// rendered them) — only the free-form list metrics (method distribution,
// top submissions by type) and trajectory are left out, since those don't
// reduce to a single comparable row the same way scalar ratios do; they
// stay on each subject's own profile page instead.

function CompareRow({
  label,
  a,
  b,
  format = "pct",
  nUnit,
}: {
  label: string;
  a: MetricValue;
  b: MetricValue;
  format?: "pct" | "rate" | "duration";
  // Mirrors MetricRow's nUnit (profile-view.tsx) — scramblePctOfTime's n is
  // total tagged seconds, not a match/event count like every other row's.
  nUnit?: string;
}) {
  const fmt =
    format === "pct" ? formatPct : format === "rate" ? formatRate : formatVideoTimestampOrDash;
  return (
    <div className="grid grid-cols-[1fr,5rem,5rem] items-center gap-2 border-b py-2 text-sm last:border-b-0 sm:grid-cols-[1fr,6rem,6rem]">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="text-right font-medium">
        {fmt(a.value)}
        <br />
        <span className="text-xs font-normal text-muted-foreground">
          n={a.n}
          {nUnit ?? ""}
        </span>
      </span>
      <span className="text-right font-medium">
        {fmt(b.value)}
        <br />
        <span className="text-xs font-normal text-muted-foreground">
          n={b.n}
          {nUnit ?? ""}
        </span>
      </span>
    </div>
  );
}

function formatVideoTimestampOrDash(value: number | null): string {
  return value === null ? "—" : formatVideoTimestamp(value);
}

function CompareBody({
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
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Neither has any breakdowns logged for this ruleset yet.
      </p>
    );
  }

  const sideA = sideSplit(profileA.style);
  const sideB = sideSplit(profileB.style);
  const firstA = firstActionSplit(profileA.style.firstAction);
  const firstB = firstActionSplit(profileB.style.firstAction);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr,5rem,5rem] gap-2 px-1 text-sm font-medium sm:grid-cols-[1fr,6rem,6rem]">
        <span />
        <span className="truncate text-right">{nameA}</span>
        <span className="truncate text-right">{nameB}</span>
      </div>

      <MetricGroup title="General">
        <div className="grid grid-cols-[1fr,5rem,5rem] items-center gap-2 border-b py-2 text-sm sm:grid-cols-[1fr,6rem,6rem]">
          <span className="text-muted-foreground">Matches logged</span>
          <span className="text-right font-medium">{profileA.matchCount}</span>
          <span className="text-right font-medium">{profileB.matchCount}</span>
        </div>
        <CompareRow
          label="Avg match time"
          a={profileA.general.avgMatchTimeSeconds}
          b={profileB.general.avgMatchTimeSeconds}
          format="duration"
        />
        <CompareRow label="Win rate" a={profileA.general.winRate} b={profileB.general.winRate} />
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
        />
      </MetricGroup>

      <MetricGroup title="Escapes">
        {profileA.escapes.map((e, i) => (
          <CompareRow
            key={e.position}
            label={humanize(e.position)}
            a={e.pct}
            b={profileB.escapes[i]?.pct ?? { value: null, n: 0 }}
          />
        ))}
      </MetricGroup>
    </div>
  );
}

export function CompareView({
  subjectA,
  subjectB,
  nameA,
  nameB,
}: {
  subjectA: ProfileSubject;
  subjectB: ProfileSubject;
  nameA: string;
  nameB: string;
}) {
  const { data: dataA, isLoading: loadingA, error: errorA } = useAthleteProfile(subjectA);
  const { data: dataB, isLoading: loadingB, error: errorB } = useAthleteProfile(subjectB);
  const [gi, setGi] = useState(true);

  if (loadingA || loadingB) {
    return <p className="text-sm text-muted-foreground">Loading profiles...</p>;
  }
  if (errorA || errorB || !dataA || !dataB) {
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load one of these profiles. Try refreshing.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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
      <CompareBody
        nameA={nameA}
        nameB={nameB}
        profileA={gi ? dataA.gi : dataA.noGi}
        profileB={gi ? dataB.gi : dataB.noGi}
      />
    </div>
  );
}
