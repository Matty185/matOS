import { z } from "zod";

// modifier/outcome validated server-side against event_types by the DB's
// validate_breakdown_event trigger (Stage A1, hardened in the review-gate
// fixes) — this schema only checks shape.
export const createBreakdownEventSchema = z.object({
  event_type_id: z.string().uuid(),
  modifier: z.string().max(50).nullable().optional(),
  outcome: z.string().max(50).nullable().optional(),
  ts: z.number().min(0),
  // See breakdown-position.ts's client_id for why this exists.
  client_id: z.string().uuid().nullable().optional(),
});

export type CreateBreakdownEventInput = z.infer<typeof createBreakdownEventSchema>;

export const updateBreakdownEventSchema = z.object({
  modifier: z.string().max(50).nullable().optional(),
  outcome: z.string().max(50).nullable().optional(),
  ts: z.number().min(0).optional(),
});

export type UpdateBreakdownEventInput = z.infer<typeof updateBreakdownEventSchema>;
