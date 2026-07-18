import { z } from "zod";
import { agentQueryField } from "@/lib/validation/agent";

export const markPaidSchema = z.object({
  member_ids: z.array(z.string().uuid()).min(1, "Select at least one member."),
});

export type MarkPaidInput = z.infer<typeof markPaidSchema>;

// Per-member, per-period record/edit — the payments grid's cell editor.
// Unlike markPaidSchema (always "paid", always the current month), this
// covers any status/period/amount combination, including waiving and
// correcting a mistaken "paid" back to "unpaid."
export const recordPaymentSchema = z.object({
  member_id: z.string().uuid(),
  period_month: z.number().int().min(1).max(12),
  period_year: z.number().int().min(2000).max(2100),
  status: z.enum(["paid", "unpaid", "waived"]),
  amount: z
    .number()
    .min(0, "Amount can't be negative.")
    .max(100000, "That amount looks too large.")
    .nullable()
    .optional(),
  notes: z.string().max(500).optional(),
  agent_query: agentQueryField,
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
