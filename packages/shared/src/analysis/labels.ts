// Stage M5: extracted after a third independent copy appeared (web's
// analysis/[id]/page.tsx and share/[token]/page.tsx, mobile's
// analysis/[id]/index.tsx) — same "extract on second/third duplication"
// pattern used throughout this project (taxonomy types at Stage S0, belt
// constants at Stage M1).
export const RESULT_LABELS = { win: "Win", loss: "Loss", draw: "Draw" } as const;
export const METHOD_LABELS = {
  submission: "Submission",
  points: "Points",
  decision: "Decision",
  dq: "DQ",
} as const;
