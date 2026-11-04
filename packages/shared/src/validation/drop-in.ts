import { z } from "zod";
import { BELT_VALUES } from "./member";

// Flow audit 4.6: a coach records a drop-in visitor against a class/date.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const money = z
  .union([z.literal(""), z.null(), z.coerce.number().min(0, "Can't be negative.").max(10000)])
  .transform((v) => (v === "" || v === null ? null : Math.round(v * 100) / 100));

export const createDropInSchema = z
  .object({
    class_id: z.string().uuid().nullable().optional(),
    visit_date: z.string().regex(ISO_DATE, "Pick a date."),
    first_name: z.string().trim().min(1, "First name is required.").max(100),
    last_name: z.string().trim().min(1, "Last name is required.").max(100),
    home_gym: z.string().trim().max(120).optional().or(z.literal("")),
    belt: z.enum(BELT_VALUES).nullable().optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter a valid email, or leave it blank.")
      .optional()
      .or(z.literal("")),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    fee: money.optional(),
    fee_paid: z.boolean().default(false),
    waiver_method: z.enum(["none", "typed", "paper"]).default("none"),
    waiver_signer_name: z.string().trim().max(200).optional().or(z.literal("")),
  })
  .refine((d) => d.waiver_method !== "typed" || (d.waiver_signer_name ?? "").trim().length >= 2, {
    message: "The visitor types their full name to agree.",
    path: ["waiver_signer_name"],
  });

export type CreateDropInInput = z.infer<typeof createDropInSchema>;

export const updateDropInSchema = z
  .object({
    fee: money.optional(),
    fee_paid: z.boolean().optional(),
  })
  .refine((d) => d.fee !== undefined || d.fee_paid !== undefined, {
    message: "Nothing to change.",
  });

export type UpdateDropInInput = z.infer<typeof updateDropInSchema>;

export const dropInFeeSchema = z.object({ drop_in_fee: money });
export type DropInFeeInput = z.infer<typeof dropInFeeSchema>;
