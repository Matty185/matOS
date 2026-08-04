import { z } from "zod";

// Stage S3 (matos_mobile_plan.md §2.4): the app's first genuinely
// public-facing surface. `redact_opponents` defaults true per the plan's
// own schema note — see the create route's comment for what it actually
// redacts, given breakdowns themselves carry no per-match opponent field.
export const createShareLinkSchema = z.object({
  type: z.enum(["profile", "breakdown"]),
  subject_id: z.string().uuid("subject_id must be a valid UUID."),
  redact_opponents: z.boolean().default(true),
});

export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;
