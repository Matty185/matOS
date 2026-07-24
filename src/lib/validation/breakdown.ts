import { z } from "zod";

// Base object kept separate from the refined schema below — Zod's
// .omit()/.pick() only work on a plain ZodObject, not on the ZodEffects a
// .refine() call produces, and the new-breakdown form needs to omit
// member_id/external_person_id (it manages focus selection itself, outside
// react-hook-form) while the API route needs the full refined version.
// Found via live testing: calling .omit() on the refined export throws
// "`.omit()` cannot be used on object schemas containing refinements" at
// runtime, not caught by typecheck/lint.
export const createBreakdownBaseSchema = z.object({
  member_id: z.string().uuid().optional(),
  external_person_id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Give this breakdown a name.").max(200),
  match_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."),
  gi: z.boolean(),
  result: z.enum(["win", "loss", "draw"]).nullable().optional(),
  method: z.enum(["submission", "points", "decision", "dq"]).nullable().optional(),
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
// artifacts"); status is untouched here too (the Finish flow, Stage A4,
// owns that transition). video_filename/video_duration_seconds are written
// by the tagging screen once a local file's metadata loads (Non-Negotiable
// #1: only the filename/duration are ever stored, never the video itself)
// — Stage A4 owns the resume-mismatch warning that reads these back.
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
});

export type UpdateBreakdownInput = z.infer<typeof updateBreakdownSchema>;
