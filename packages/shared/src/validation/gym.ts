import { z } from "zod";
import { isValidTimeZone } from "../time/gym-time";
import { BELT_VALUES, PLAN_VALUES } from "./member";

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

// Flow audit 5.3: promotion guidance (owner, Settings or the Promotions
// page). Blank/null turns a criterion off; at least one must stay on.
const optionalCount = (max: number, label: string) =>
  z
    .union([
      z.literal(""),
      z.null(),
      z.coerce
        .number()
        .int()
        .min(1, `${label} must be at least 1.`)
        .max(max, `${label} can be at most ${max}.`),
    ])
    .transform((v) => (v === "" || v === null ? null : v));

export const promotionRulesSchema = z
  .object({
    promotion_classes_per_stripe: optionalCount(500, "Classes"),
    promotion_months_per_stripe: optionalCount(60, "Months"),
  })
  .refine(
    (d) => d.promotion_classes_per_stripe !== null || d.promotion_months_per_stripe !== null,
    { message: "Set at least one: classes or months.", path: ["promotion_classes_per_stripe"] },
  );

export type PromotionRulesInput = z.infer<typeof promotionRulesSchema>;

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

// Flow audit 6.7: the gym's membership plans (owner, Settings). The billing
// type is fixed once a plan exists; prices are guidance for recording
// payments — nothing is charged.
const planPrice = z
  .union([
    z.literal(""),
    z.null(),
    z.coerce
      .number()
      .min(0, "Price can't be negative.")
      .max(100000, "That price is too high.")
      .refine(
        (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6,
        "Use at most two decimals (cents).",
      ),
  ])
  .transform((v) => (v === "" || v === null ? null : Math.round(v * 100) / 100));

const planName = z
  .string()
  .trim()
  .min(1, "Name the plan.")
  .max(60, "Keep the name under 60 characters.");

export const MAX_GYM_PLANS = 30;

// Flow audit 6.6 (L1): a Stripe Payment Link for the plan. Same rule as the
// database check: only https://buy.stripe.com/<id>, nothing else. Blank
// clears it.
export const STRIPE_PAYMENT_LINK = /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_-]{6,100}$/;
const paymentLink = z
  .union([
    z.literal(""),
    z.null(),
    z
      .string()
      .trim()
      .regex(
        STRIPE_PAYMENT_LINK,
        "Paste a Stripe Payment Link, like https://buy.stripe.com/… (nothing after it).",
      ),
  ])
  .transform((v) => (v ? v : null));

export const createGymPlanSchema = z.object({
  name: planName,
  kind: z.enum(PLAN_VALUES),
  price: planPrice,
  payment_link_url: paymentLink.optional(),
});

export type CreateGymPlanInput = z.infer<typeof createGymPlanSchema>;

export const updateGymPlanSchema = z
  .object({
    name: planName.optional(),
    price: planPrice.optional(),
    active: z.boolean().optional(),
    payment_link_url: paymentLink.optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined ||
      d.price !== undefined ||
      d.active !== undefined ||
      d.payment_link_url !== undefined,
    {
      message: "Nothing to change.",
    },
  );

export type UpdateGymPlanInput = z.infer<typeof updateGymPlanSchema>;

// Flow audit 8.3: discount for the second and later children of one family.
export const siblingDiscountSchema = z.object({
  sibling_discount_percent: z.coerce
    .number()
    .int("Use a whole number.")
    .min(0, "0 to 90.")
    .max(90, "0 to 90."),
});

export type SiblingDiscountInput = z.infer<typeof siblingDiscountSchema>;

// Flow audit 2.6 + 10.5: storage paths for a member photo / the gym logo.
// The routes also check the gym/member folders match the caller and member.
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const memberPhotoPathSchema = z.object({
  path: z
    .string()
    .regex(new RegExp(`^${UUID}/${UUID}/${UUID}\\.(jpg|png|webp)$`), "Bad photo path."),
});
/** gym-logos path: <gym_id>/<uuid>.<ext> (also checked before signing). */
export const GYM_LOGO_PATH = new RegExp(`^${UUID}/${UUID}\\.(jpg|png|webp)$`);
export const gymLogoPathSchema = z.object({
  path: z.string().regex(GYM_LOGO_PATH, "Bad logo path."),
});
