import { z } from "zod";

export const createExternalPersonSchema = z.object({
  display_name: z.string().trim().min(1, "Enter a name.").max(200),
  // .nullable() alongside .optional(): the form dialog converts an empty
  // textarea to null before sending (`notes: data.notes || null`), which
  // .optional() alone rejects (only undefined counts as "absent") — found
  // via live testing, the same empty-value/schema-mismatch bug class as
  // breakdown's result/method fields.
  notes: z.string().max(1000).nullable().optional(),
});

export type CreateExternalPersonInput = z.infer<typeof createExternalPersonSchema>;

export const updateExternalPersonSchema = z.object({
  display_name: z.string().trim().min(1).max(200).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type UpdateExternalPersonInput = z.infer<typeof updateExternalPersonSchema>;
