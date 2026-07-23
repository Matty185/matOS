import type { Database } from "@/types/database";

// Shared so the member list and profile pages (and any future screen) can't
// silently drift from each other if the membership_plan enum ever changes —
// flagged as duplicated in Stage 4 code review.
export const PLAN_LABELS: Record<Database["public"]["Enums"]["membership_plan"], string> = {
  monthly: "Monthly",
  casual: "Casual",
  comp_team: "Comp Team",
};

// Duplicated verbatim between (coach)/layout.tsx and analysis/layout.tsx
// before this — flagged in Stage A2 code review.
export const ROLE_LABEL: Record<Database["public"]["Enums"]["member_role"], string> = {
  gym_owner: "Owner",
  coach: "Coach",
  athlete: "Athlete",
};
