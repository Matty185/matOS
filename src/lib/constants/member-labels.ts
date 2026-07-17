import type { Database } from "@/types/database";

// Shared so the member list and profile pages (and any future screen) can't
// silently drift from each other if the membership_plan enum ever changes —
// flagged as duplicated in Stage 4 code review.
export const PLAN_LABELS: Record<Database["public"]["Enums"]["membership_plan"], string> = {
  monthly: "Monthly",
  casual: "Casual",
  comp_team: "Comp Team",
};
