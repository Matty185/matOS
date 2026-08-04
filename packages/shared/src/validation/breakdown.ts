import { z } from "zod";

// Base object kept separate from the refined schema below — Zod's
// .omit()/.pick() only work on a plain ZodObject, not on the ZodEffects a
// .refine() call produces, and the new-breakdown form needs to omit
// member_id/external_person_id (it manages focus selection itself, outside
// react-hook-form) while the API route needs the full refined version.
// Found via live testing: calling .omit() on the refined export throws
// "`.omit()` cannot be used on object schemas containing refinements" at
// runtime, not caught by typecheck/lint.
// Stage S2 (matos_mobile_plan.md §2.2): optional here, not required — the
// API route sets a context-aware default (private in a personal
// workspace, gym in a real gym) when omitted, rather than relying on the
// DB column's own flat 'gym' default, which doesn't know which kind of
// gym it's inserting into.
export const createBreakdownBaseSchema = z.object({
  member_id: z.string().uuid().optional(),
  external_person_id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Give this breakdown a name.").max(200),
  match_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."),
  gi: z.boolean(),
  result: z.enum(["win", "loss", "draw"]).nullable().optional(),
  method: z.enum(["submission", "points", "decision", "dq"]).nullable().optional(),
  visibility: z.enum(["private", "gym"]).optional(),
});

// Focus is exactly one of member_id/external_person_id — mirrors the DB's
// own breakdowns_exactly_one_focus CHECK constraint, checked here too for a
// friendly error instead of a raw Postgres constraint message. Neither
// field is ever trusted beyond "is this a real record I own/can author
// for" — RLS (breakdowns_all_own) is the actual enforcement boundary once
// this reaches the DB.
export const createBreakdownSchema = createBreakdownBaseSchema.refine(
  (data) => Boolean(data.member_id) !== Boolean(data.external_person_id),
  {
    message: "Pick exactly one focus — a gym member or an external person.",
    path: ["member_id"],
  },
);

export type CreateBreakdownInput = z.infer<typeof createBreakdownSchema>;

// Metadata-only edit — focus (member_id/external_person_id) never changes
// after creation, matching Non-Negotiable #5 ("breakdowns are standalone
// artifacts"). video_filename/video_duration_seconds are written by the
// tagging screen once a local file's metadata loads (Non-Negotiable #1:
// only the filename/duration are ever stored, never the video itself) —
// the tagging screen also reads these back to warn on a filename/duration
// mismatch when resuming (Stage A4). status is the Stage A4 Finish/Reopen
// toggle — not tied to any write-permission change (an author can still
// edit a "complete" breakdown; it's a milestone marker, not a lock).
// duration_seconds is the match-metadata field plan §3/§5 describe as
// "auto from video" — distinct from video_duration_seconds (which exists
// solely for the resume-mismatch comparison and tracks whatever file is
// loaded *this* session). Nothing wrote it before Stage A5; the tagging
// screen now sets it alongside video_duration_seconds whenever a video's
// metadata loads, since A5's avg-match-time profile metric reads it.
export const updateBreakdownSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  match_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")
    .optional(),
  gi: z.boolean().optional(),
  result: z.enum(["win", "loss", "draw"]).nullable().optional(),
  method: z.enum(["submission", "points", "decision", "dq"]).nullable().optional(),
  video_filename: z.string().max(500).nullable().optional(),
  video_duration_seconds: z.number().positive().nullable().optional(),
  duration_seconds: z.number().positive().nullable().optional(),
  status: z.enum(["in_progress", "complete"]).optional(),
  visibility: z.enum(["private", "gym"]).optional(),
});

export type UpdateBreakdownInput = z.infer<typeof updateBreakdownSchema>;
