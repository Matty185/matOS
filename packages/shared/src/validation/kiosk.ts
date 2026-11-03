import { z } from "zod";

// Flow audit 4.4: front-desk kiosk.
export const createKioskDeviceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the tablet a name.")
    .max(50, "Keep the name under 50 characters."),
});

export const kioskActivateSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "That setup link isn't valid."),
});

export const kioskCheckInSchema = z.object({
  class_id: z.string().uuid(),
  member_id: z.string().uuid(),
});

export type KioskCheckInInput = z.infer<typeof kioskCheckInSchema>;
