import { z } from "zod";

// role validated server-side against positions.roles by the DB's own
// validate_breakdown_position trigger (Stage A1) — this schema only checks
// shape, not membership, matching how breakdown-event validation already
// splits the work between Zod (shape) and the DB trigger (data-driven
// membership rules).
export const createBreakdownPositionSchema = z.object({
  position_id: z.string().uuid(),
  role: z.string().max(50).nullable().optional(),
  start_ts: z.number().min(0),
  // Client-generated idempotency key (mobile's local draft row id) — a
  // retried create after a lost response is a safe no-op server-side
  // rather than a duplicate/phantom row. Optional: web's own tagging
  // screen has no offline/retry concern and never sends one.
  client_id: z.string().uuid().nullable().optional(),
});

export type CreateBreakdownPositionInput = z.infer<typeof createBreakdownPositionSchema>;

export const updateBreakdownPositionSchema = z.object({
  role: z.string().max(50).nullable().optional(),
  start_ts: z.number().min(0).optional(),
  end_ts: z.number().min(0).nullable().optional(),
});

export type UpdateBreakdownPositionInput = z.infer<typeof updateBreakdownPositionSchema>;
