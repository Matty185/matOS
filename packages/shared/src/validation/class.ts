import { z } from "zod";
import { agentQueryField } from "./agent";

const CLASS_TYPE_VALUES = ["gi", "no_gi", "comp", "open_mat"] as const;

export const createClassSchema = z.object({
  name: z.string().trim().min(1, "Class name is required.").max(100),
  class_type: z.enum(CLASS_TYPE_VALUES),
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time (HH:MM)."),
  duration_minutes: z.number().int().min(1).max(600),
  max_capacity: z.number().int().min(1).max(500).nullable().optional(),
  agent_query: agentQueryField,
});

export type CreateClassInput = z.infer<typeof createClassSchema>;

export const editClassSchema = createClassSchema.extend({
  active: z.boolean(),
});

export type EditClassInput = z.infer<typeof editClassSchema>;

// Flow audit 3.2: cancel or move one session of a recurring class.
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-02.")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Pick a real date.");

export const classSessionChangeSchema = z
  .object({
    session_date: calendarDate,
    action: z.enum(["cancel", "move"]),
    new_date: calendarDate.optional(),
    new_start_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time (HH:MM).")
      .optional(),
    note: z
      .string()
      .trim()
      .max(200, "Keep the note under 200 characters.")
      .optional()
      .transform((v) => (v ? v : undefined)),
    agent_query: agentQueryField,
  })
  .superRefine((v, ctx) => {
    if (v.action === "move") {
      if (!v.new_date)
        ctx.addIssue({ code: "custom", path: ["new_date"], message: "Pick the new date." });
      if (!v.new_start_time)
        ctx.addIssue({ code: "custom", path: ["new_start_time"], message: "Pick the new time." });
    }
  });

export type ClassSessionChangeInput = z.infer<typeof classSessionChangeSchema>;
