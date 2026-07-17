import { z } from "zod";

export const markPaidSchema = z.object({
  member_ids: z.array(z.string().uuid()).min(1, "Select at least one member."),
});

export type MarkPaidInput = z.infer<typeof markPaidSchema>;
