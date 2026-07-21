import { formatEventTimestamp } from "@/lib/analysis/labels";
import type { AthleteAnalysisStats } from "@/lib/analysis/stats";

// Per-athlete aggregate, computed in JS from already-fetched rows (see
// computeAthleteAnalysisStats) — matches overdue.ts's "fetch broadly,
// aggregate in JS" pattern, no DB view. Shared between the athlete's own
// upload/analysis page and the coach's member-profile AnalysisTab.
export function AnalysisStatsSummary({ stats }: { stats: AthleteAnalysisStats }) {
  if (stats.matchesAnalyzed === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-4 rounded-md border p-4 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label="Matches" value={String(stats.matchesAnalyzed)} />
      <Stat
        label="Avg time"
        value={
          stats.averageDurationSeconds !== null
            ? formatEventTimestamp(stats.averageDurationSeconds)
            : "—"
        }
      />
      <Stat
        label="Record (W-L-D)"
        value={`${stats.record.wins}-${stats.record.losses}-${stats.record.draws}`}
      />
      <Stat label="Takedowns" value={String(stats.takedowns)} />
      <Stat label="Sub. attempts" value={String(stats.submissionAttempts)} />
      <Stat label="Submissions" value={String(stats.submissionsLanded)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-medium">{value}</span>
    </div>
  );
}
