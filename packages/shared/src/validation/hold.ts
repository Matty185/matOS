import { z } from "zod";
import { agentQueryField } from "./agent";

// Flow audit 2.4: membership holds are whole months ("2026-12"). The route
// stores them as the 1st of the month and enforces the bounds in the gym's
// timezone (start no earlier than 12 months ago, at most 12 months long).

export const HOLD_MAX_MONTHS = 12;

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month.");

/** "2026-12" → months since year 0, for ordering and span checks. */
export function monthIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return (y ?? 0) * 12 + ((m ?? 1) - 1);
}

export const createHoldSchema = z
  .object({
    start_month: yearMonth,
    end_month: yearMonth,
    agent_query: agentQueryField,
  })
  .superRefine((v, ctx) => {
    const span = monthIndex(v.end_month) - monthIndex(v.start_month);
    if (span < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["end_month"],
        message: "End can't be before the start.",
      });
    } else if (span >= HOLD_MAX_MONTHS) {
      ctx.addIssue({
        code: "custom",
        path: ["end_month"],
        message: `A hold can be at most ${HOLD_MAX_MONTHS} months.`,
      });
    }
  });

export type CreateHoldInput = z.infer<typeof createHoldSchema>;

export const editHoldSchema = z.object({
  end_month: yearMonth,
  agent_query: agentQueryField,
});

export type EditHoldInput = z.infer<typeof editHoldSchema>;
