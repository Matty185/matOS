import { z } from "zod";

const BELT_VALUES = [
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

const PLAN_VALUES = ["monthly", "casual", "comp_team"] as const;

export const createMemberSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required.").max(100),
  last_name: z.string().trim().min(1, "Last name is required.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  emergency_contact_name: z.string().trim().max(100).optional().or(z.literal("")),
  emergency_contact_phone: z.string().trim().max(30).optional().or(z.literal("")),
  membership_plan: z.enum(PLAN_VALUES),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;

// Same fields as create, minus email — changing the email a member logs in
// with is an auth.users concern, not a plain member-record edit; out of
// scope here (belt/stripes/role/active all have their own dedicated
// actions — promote, and deactivate — not this generic edit).
export const editMemberSchema = createMemberSchema.omit({ email: true });

export type EditMemberInput = z.infer<typeof editMemberSchema>;

export const promoteBeltSchema = z.object({
  belt: z.enum(BELT_VALUES),
  stripes: z.number().int().min(0).max(4),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type PromoteBeltInput = z.infer<typeof promoteBeltSchema>;

export const deactivateMemberSchema = z.object({
  confirm: z.literal(true, { message: "Confirmation is required." }),
});

export type DeactivateMemberInput = z.infer<typeof deactivateMemberSchema>;
