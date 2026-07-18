import { z } from "zod";
import { agentQueryField } from "@/lib/validation/agent";

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
