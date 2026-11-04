import { z } from "zod";
import { agentQueryField } from "./agent";

export const BELT_VALUES = [
  "white",
  "grey_white",
  "grey",
  "grey_black",
  "yellow_white",
  "yellow",
  "yellow_black",
  "orange_white",
  "orange",
  "orange_black",
  "green_white",
  "green",
  "green_black",
  "blue",
  "purple",
  "brown",
  "black",
] as const;

export const PLAN_VALUES = ["monthly", "casual", "comp_team"] as const;

// Contact/plan fields shared by create and edit.
const memberFieldsSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required.").max(100),
  last_name: z.string().trim().min(1, "Last name is required.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  emergency_contact_name: z.string().trim().max(100).optional().or(z.literal("")),
  emergency_contact_phone: z.string().trim().max(30).optional().or(z.literal("")),
  membership_plan: z.enum(PLAN_VALUES),
  // Flow audit 6.7: the gym's own named plan. When given it wins — the
  // route sets membership_plan (the billing type) from the plan.
  plan_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Stage O2/O3: a member's *starting* rank and join date are set at creation
// (recorded as an is_initial belt_history row, not a promotion) — an
// existing gym's purple belt shouldn't have to be "promoted" from white.
// After creation, belt changes only ever go through .../promote.
export const startingRankFields = {
  belt: z.enum(BELT_VALUES).default("white"),
  stripes: z.coerce.number().int().min(0, "Stripes are 0–4.").max(4, "Stripes are 0–4.").default(0),
  join_date: z
    .string()
    .regex(ISO_DATE, "Use a date like 2024-03-01.")
    .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), "Not a real date.")
    .refine(
      (v) => v <= new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      "Join date can't be in the future.",
    )
    .optional()
    .or(z.literal("")),
};

// Email is optional on create (flow audit 8.1): kids and anyone without
// their own email are roster-only — no login, and no invite can be sent.
// Blank becomes null so the per-gym unique constraint never sees "".
export const createMemberSchema = memberFieldsSchema.extend({
  ...startingRankFields,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address, or leave it blank.")
    .optional()
    // "" from a raw request, null once the form's own resolver has run this
    // transform (the client then sends the parsed value). Both mean "no
    // email": a roster-only member.
    .or(z.literal(""))
    .or(z.null())
    .transform((v) => (v ? v : null)),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;

export const MAX_IMPORT_ROWS = 300;

// Bulk import (Stage O3). Same per-row rules as a single create; duplicate
// emails within one batch are rejected here (with the row numbers) rather
// than surfacing as an opaque unique-violation from the database.
export const importMembersSchema = z
  .object({
    members: z
      .array(createMemberSchema)
      .min(1, "Nothing to import.")
      .max(MAX_IMPORT_ROWS, `At most ${MAX_IMPORT_ROWS} members per import.`),
  })
  .superRefine((data, ctx) => {
    const seen = new Map<string, number>();
    data.members.forEach((m, i) => {
      if (!m.email) return;
      const prev = seen.get(m.email);
      if (prev !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["members", i, "email"],
          message: `Same email as row ${prev + 1}.`,
        });
      } else {
        seen.set(m.email, i);
      }
    });
  });

export type ImportMembersInput = z.infer<typeof importMembersSchema>;

// Same fields as create, minus email — changing the email a member logs in
// with is an auth.users concern, not a plain member-record edit; out of
// scope here (belt/stripes/role/active all have their own dedicated
// actions — promote, and deactivate — not this generic edit).
// Email on edit (flow audit 1.11): absent = unchanged, "" = remove (the
// member becomes roster-only), otherwise the corrected address. The route
// only allows it while the member hasn't signed up — after that the email
// is their login.
export const editMemberSchema = memberFieldsSchema.omit({ email: true }).extend({
  email: z
    .union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email address.")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
  agent_query: agentQueryField,
});

export type EditMemberInput = z.infer<typeof editMemberSchema>;

export const promoteBeltSchema = z.object({
  belt: z.enum(BELT_VALUES),
  stripes: z.number().int().min(0).max(4),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  agent_query: agentQueryField,
});

export type PromoteBeltInput = z.infer<typeof promoteBeltSchema>;

// Flow audit 5.4: grading day — promote several members at once, with one
// shared note. Each member at most once; capped so one request stays quick.
export const MAX_GRADING_PROMOTIONS = 50;
export const gradingDaySchema = z
  .object({
    promotions: z
      .array(
        z.object({
          member_id: z.string().uuid(),
          belt: z.enum(BELT_VALUES),
          stripes: z.number().int().min(0).max(4),
        }),
      )
      .min(1, "Pick at least one member.")
      .max(MAX_GRADING_PROMOTIONS, `At most ${MAX_GRADING_PROMOTIONS} at a time.`),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
  })
  .refine((v) => new Set(v.promotions.map((p) => p.member_id)).size === v.promotions.length, {
    message: "Each member can only be promoted once per grading.",
    path: ["promotions"],
  });

export type GradingDayInput = z.infer<typeof gradingDaySchema>;

export const deactivateMemberSchema = z.object({
  confirm: z.literal(true, { message: "Confirmation is required." }),
  agent_query: agentQueryField,
  // Only meaningful (and only validated) for agent-initiated calls — see
  // the route handler. Optional so the direct-dashboard confirm-dialog
  // path (which never sends it) still validates.
  typed_confirmation: z.string().optional(),
});

export type DeactivateMemberInput = z.infer<typeof deactivateMemberSchema>;

// The undo for deactivation (a member returning after injury or travel).
export const reactivateMemberSchema = z.object({
  confirm: z.literal(true, { message: "Confirmation is required." }),
});
