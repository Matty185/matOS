// @matos/shared — barrel export. Stage S0 (matos_mobile_plan.md §2.1):
// types, Zod schemas, event taxonomy types, metric computation, a minimal
// Supabase client factory, and format utils, extracted out of apps/web so
// apps/mobile (Stage M0+) can depend on the exact same logic rather than
// re-deriving it. No react-dom or react-native import anywhere in this
// package — logic and types only.

export * from "./types/database";

export * from "./validation/account";
export * from "./validation/agent";
export * from "./validation/attendance";
export * from "./validation/auth";
export * from "./validation/breakdown";
export * from "./validation/breakdown-event";
export * from "./validation/breakdown-position";
export * from "./validation/class";
export * from "./validation/gym";
export * from "./validation/external-person";
export * from "./validation/invite";
export * from "./validation/member";
export * from "./validation/payment";
export * from "./validation/share-link";

export * from "./attendance/home-summary";
export * from "./belt/constants";

export * from "./analysis/profile";
export * from "./analysis/metric-catalog";
export * from "./analysis/metric-format";
export * from "./analysis/fetch-profile-data";
export * from "./analysis/compare";
export * from "./analysis/labels";

export * from "./time/gym-time";
export * from "./import/roster";

export * from "./format/humanize";
export * from "./utils";

export * from "./taxonomy/types";

export * from "./supabase/client";
