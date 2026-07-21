import { z } from "zod";

// Kept in sync with the analysis_event_type enum
// (supabase/migrations/20260722130000_analysis_events_rework.sql).
export const ANALYSIS_EVENT_TYPES = [
  "wrestling",
  "underhook",
  "takedown",
  "guard_pull",
  "sweep",
  "submission_attempt",
  "submission",
  "escape",
  "reversal",
  "guard_pass",
  "mount_control",
  "back_control",
  "side_control",
  "half_guard",
  "guard_bottom",
  "stalling",
] as const;

export const analysisEventTypeSchema = z.enum(ANALYSIS_EVENT_TYPES);

// POST /api/analyses — creates a manual-entry analysis only. `method` is
// never client-supplied: 'ai_stub' is only ever set server-side by
// /api/video/upload, which is the one place a simulated-processing delay
// and the daily rate limit apply. Letting this route accept a `method`
// field would let a client spoof 'ai_stub' (or dodge it) directly.
export const createAnalysisSchema = z.object({
  member_id: z.string().uuid().optional(),
  title: z.string().min(1, "Title is required.").max(200),
});

export type CreateAnalysisInput = z.infer<typeof createAnalysisSchema>;

// PATCH /api/analyses/:id — metadata edits plus the manual "Finish" action
// (mark_complete). Works for both an in-progress manual entry and
// correcting an AI-stub-generated analysis after the fact.
export const updateAnalysisSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  duration_seconds: z.number().positive().max(21600).optional(),
  opponent_name: z.string().max(200).nullable().optional(),
  result: z.enum(["win", "loss", "draw"]).nullable().optional(),
  result_method: z.enum(["submission", "points", "decision", "dq", "other"]).nullable().optional(),
  mark_complete: z.boolean().optional(),
});

export type UpdateAnalysisInput = z.infer<typeof updateAnalysisSchema>;

export const createAnalysisEventSchema = z.object({
  event_type: analysisEventTypeSchema,
  timestamp_seconds: z.number().min(0).max(21600),
  duration_seconds: z.number().positive().max(21600).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type CreateAnalysisEventInput = z.infer<typeof createAnalysisEventSchema>;

export const updateAnalysisEventSchema = createAnalysisEventSchema.partial();

export type UpdateAnalysisEventInput = z.infer<typeof updateAnalysisEventSchema>;
