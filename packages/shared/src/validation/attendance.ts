import { z } from "zod";
import { agentQueryField } from "./agent";

// Coach manual marking — any member, any class, any date (including
// backdated, per Stage 1's attendance.checked_in_date design comment,
// written specifically to support "a coach logging historical attendance").
export const markAttendanceSchema = z.object({
  member_id: z.string().uuid(),
  class_id: z.string().uuid(),
  checked_in_at: z
    .string()
    .datetime()
    .refine((v) => new Date(v) <= new Date(), "checked_in_at cannot be in the future")
    .optional(),
  agent_query: agentQueryField,
});

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

// Athlete self-check-in — always "now," always themselves (context.memberId
// server-side, never trusted from input).
export const checkInSchema = z.object({
  class_id: z.string().uuid(),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
