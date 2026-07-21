import type { Database } from "@/types/database";

export type AnalysisEventType = Database["public"]["Enums"]["analysis_event_type"];
export type AnalysisResult = Database["public"]["Enums"]["analysis_result"];
export type AnalysisStatus = Database["public"]["Enums"]["analysis_status"];

export type AnalysisRowForStats = {
  id: string;
  status: AnalysisStatus;
  duration_seconds: number | null;
  result: AnalysisResult | null;
};

export type AnalysisEventRowForStats = {
  analysis_id: string;
  event_type: AnalysisEventType;
};

export type AthleteAnalysisStats = {
  matchesAnalyzed: number;
  averageDurationSeconds: number | null;
  record: { wins: number; losses: number; draws: number };
  eventCounts: Partial<Record<AnalysisEventType, number>>;
  submissionAttempts: number;
  submissionsLanded: number;
  takedowns: number;
};

// Follows overdue.ts's "fetch broadly, aggregate in JS" pattern: callers
// pass in already-fetched, per-member-bounded rows (a bounded, alpha-scale
// fetch) rather than this doing any querying itself — no DB view or
// materialized aggregate. Only "complete" analyses count toward the
// profile — a manual entry still being logged (status 'pending') isn't a
// finished data point yet, so both its duration/result and its events are
// excluded until the athlete/coach explicitly finishes it.
export function computeAthleteAnalysisStats(
  analyses: AnalysisRowForStats[],
  events: AnalysisEventRowForStats[],
): AthleteAnalysisStats {
  const complete = analyses.filter((a) => a.status === "complete");
  const completeIds = new Set(complete.map((a) => a.id));

  const durations = complete.map((a) => a.duration_seconds).filter((d): d is number => d !== null);

  const record = { wins: 0, losses: 0, draws: 0 };
  for (const a of complete) {
    if (a.result === "win") record.wins += 1;
    else if (a.result === "loss") record.losses += 1;
    else if (a.result === "draw") record.draws += 1;
  }

  const eventCounts: Partial<Record<AnalysisEventType, number>> = {};
  for (const event of events) {
    if (!completeIds.has(event.analysis_id)) continue;
    eventCounts[event.event_type] = (eventCounts[event.event_type] ?? 0) + 1;
  }

  return {
    matchesAnalyzed: complete.length,
    averageDurationSeconds:
      durations.length > 0
        ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
        : null,
    record,
    eventCounts,
    submissionAttempts: eventCounts.submission_attempt ?? 0,
    submissionsLanded: eventCounts.submission ?? 0,
    takedowns: eventCounts.takedown ?? 0,
  };
}
