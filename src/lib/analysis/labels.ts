import type { Database } from "@/types/database";
import type { AnalysisEventType, AnalysisResult } from "@/lib/analysis/stats";

type AnalysisResultMethod = Database["public"]["Enums"]["analysis_result_method"];

// Single source of truth for event-type labels/grouping — used by the
// manual player's type picker, the shared event-log display, and the
// coach/athlete stats blocks, so all three stay in sync with the
// analysis_event_type enum (supabase/migrations/20260722130000_analysis_events_rework.sql)
// without each hardcoding its own copy.
export const EVENT_TYPE_LABELS: Record<AnalysisEventType, string> = {
  wrestling: "Wrestling / scrambling",
  underhook: "Underhook",
  takedown: "Takedown",
  takedown_defence: "Takedown defence",
  guard_pull: "Guard pull",
  sweep: "Sweep",
  submission_attempt: "Submission attempt",
  submission: "Submission (landed)",
  escape: "Escape",
  reversal: "Reversal",
  guard_pass: "Guard pass",
  mount_control: "Mount control",
  back_control: "Back control",
  side_control: "Side control",
  half_guard: "Half guard",
  guard_bottom: "Guard (bottom)",
  stalling: "Stalling",
};

// Duration-based events (start + length) vs instantaneous ones — drives
// whether the manual player's "log event" form shows a stop/duration
// control.
export const DURATION_EVENT_TYPES: ReadonlySet<AnalysisEventType> = new Set<AnalysisEventType>([
  "wrestling",
  "mount_control",
  "back_control",
  "side_control",
  "half_guard",
  "guard_bottom",
  "stalling",
]);

export const RESULT_LABELS: Record<AnalysisResult, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
};

export const RESULT_METHOD_LABELS: Record<AnalysisResultMethod, string> = {
  submission: "Submission",
  points: "Points",
  decision: "Decision",
  dq: "DQ",
  other: "Other",
};

export function formatEventTimestamp(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
