import { z } from "zod";

// Contact fields only — matches exactly what the Stage 1 trigger
// (enforce_member_self_update_scope) permits an athlete to change on their
// own members row. Anything else (name, belt, plan, active...) has its own
// dedicated coach-only action and is rejected at the DB layer regardless of
// what this schema would otherwise allow.
export const accountEditSchema = z.object({
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  emergency_contact_name: z.string().trim().max(100).optional().or(z.literal("")),
  emergency_contact_phone: z.string().trim().max(30).optional().or(z.literal("")),
});

export type AccountEditInput = z.infer<typeof accountEditSchema>;

export const athleteLogSchema = z.object({
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."),
  working_on: z.string().trim().max(500).optional().or(z.literal("")),
  struggling_with: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  visible_to_coach: z.boolean(),
});

export type AthleteLogInput = z.infer<typeof athleteLogSchema>;
