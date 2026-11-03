import type { Database } from "@matos/shared";

type Role = Database["public"]["Enums"]["member_role"];

/**
 * Staff = coach or owner, named explicitly. Never write `role !== "athlete"`
 * for this: since flow audit 8.2 there is a fourth role, 'guardian' (a
 * parent account), which is not staff.
 */
export function isStaffRole(role: Role | string): boolean {
  return role === "coach" || role === "gym_owner";
}

/** Where each role lands after sign-in (real gyms; solo is handled first). */
export function homePathFor(role: Role | string): string {
  if (isStaffRole(role)) return "/dashboard";
  if (role === "guardian") return "/family";
  return "/home";
}
