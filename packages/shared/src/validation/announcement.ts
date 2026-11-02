import { z } from "zod";

/** How far ahead an announcement can stay up (days from the gym's today). */
export const ANNOUNCEMENT_MAX_DAYS = 90;
/** Default "show until": two weeks from the gym's today. */
export const ANNOUNCEMENT_DEFAULT_DAYS = 14;

// Flow audit 7.1: a gym-wide announcement. No agent_query: the assistant has
// no write tool for announcements.
export const createAnnouncementSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give it a title.")
    .max(100, "Keep the title under 100 characters."),
  body: z
    .string()
    .trim()
    .max(2000, "Keep the message under 2000 characters.")
    .optional()
    .transform((v) => (v ? v : undefined)),
  show_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, "Pick a real date."),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
