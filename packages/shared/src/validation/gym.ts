import { z } from "zod";
import { isValidTimeZone } from "../time/gym-time";
import { BELT_VALUES } from "./member";

// Stage O5: owner-editable gym details (Settings → Gym, and the /setup
// wizard's first step). kind/active are never editable here — the
// gyms_owner_column_guard trigger enforces that at the DB layer too.
export const updateGymSchema = z.object({
  name: z.string().trim().min(1, "Gym name is required.").max(120),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  contact_email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address.")
    .optional()
    .or(z.literal("")),
  // IANA names only ("Europe/Dublin"), matching the DB trigger, which
  // checks pg_timezone_names. The "/" requirement rejects bare
  // abbreviations and legacy fixed-offset names ("EST") that Intl accepts.
  timezone: z
    .string()
    .trim()
    .refine((tz) => tz.includes("/") && isValidTimeZone(tz), "Choose a time zone from the list."),
});

export type UpdateGymInput = z.infer<typeof updateGymSchema>;

// Stage O5: owner adds a coach (Settings → Team / setup wizard). Coaches
// get a starting rank too — they're on the mat like everyone else.
export const addCoachSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required.").max(100),
  last_name: z.string().trim().min(1, "Last name is required.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  belt: z.enum(BELT_VALUES).default("black"),
  stripes: z.coerce.number().int().min(0).max(4).default(0),
});

export type AddCoachInput = z.infer<typeof addCoachSchema>;

export const STAFF_ROLE_VALUES = ["gym_owner", "coach", "athlete"] as const;

export const changeRoleSchema = z.object({
  role: z.enum(STAFF_ROLE_VALUES),
});

export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
