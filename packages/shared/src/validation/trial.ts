import { z } from "zod";
import { agentQueryField } from "./agent";

// Flow audit 9.1: free-trial requests from a gym's public link, and the
// coach side (status, notes, conversion to a member).

export const TRIAL_EXPERIENCE_VALUES = ["none", "some", "experienced"] as const;
export type TrialExperience = (typeof TRIAL_EXPERIENCE_VALUES)[number];
export const TRIAL_EXPERIENCE_LABELS: Record<TrialExperience, string> = {
  none: "Never trained",
  some: "Trained a little",
  experienced: "Trained for a while",
};

export const TRIAL_STATUS_VALUES = [
  "new",
  "contacted",
  "booked",
  "attended",
  "converted",
  "not_interested",
] as const;
export type TrialStatus = (typeof TRIAL_STATUS_VALUES)[number];
export const TRIAL_STATUS_LABELS: Record<TrialStatus, string> = {
  new: "New",
  contacted: "Contacted",
  booked: "Trial booked",
  attended: "Came to trial",
  converted: "Joined",
  not_interested: "Not interested",
};

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const trialRequestSchema = z
  .object({
    first_name: z.string().trim().min(1, "Enter a first name.").max(50),
    last_name: z.string().trim().min(1, "Enter a last name.").max(50),
    email: z.preprocess(
      blankToUndefined,
      z.string().trim().toLowerCase().email("Enter a valid email.").max(254).optional(),
    ),
    phone: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .regex(/^[+()\d\s-]{5,30}$/, "Enter a valid phone number.")
        .refine((v) => v.replace(/\D/g, "").length >= 7, "Enter a valid phone number.")
        .optional(),
    ),
    experience: z.enum(TRIAL_EXPERIENCE_VALUES, { message: "Pick one." }),
    // A parent booking for their child: the names are the child's, the
    // contact details and parent_name are the parent's.
    for_child: z.boolean().optional().default(false),
    parent_name: z.preprocess(blankToUndefined, z.string().trim().min(2).max(100).optional()),
    message: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
    class_id: z.preprocess(blankToUndefined, z.string().uuid().optional()),
    session_date: z.preprocess(
      blankToUndefined,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    ),
    consent: z.literal(true, { message: "Tick the box so the gym can contact you." }),
    // Honeypot: hidden from people (and named so autofill skips it),
    // filled in by naive bots.
    hp_field: z.string().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.email && !v.phone) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Give an email or a phone number so the gym can reach you.",
      });
    }
    if (v.for_child && !v.parent_name) {
      ctx.addIssue({ code: "custom", path: ["parent_name"], message: "Enter your own name too." });
    }
    if (!!v.class_id !== !!v.session_date) {
      ctx.addIssue({ code: "custom", path: ["class_id"], message: "Pick a class from the list." });
    }
  });

export type TrialRequestInput = z.infer<typeof trialRequestSchema>;

export const updateTrialLeadSchema = z.object({
  status: z.enum(TRIAL_STATUS_VALUES).optional(),
  coach_notes: z.string().trim().max(1000).nullable().optional(),
  converted_member_id: z.string().uuid().optional(),
  agent_query: agentQueryField,
});

export type UpdateTrialLeadInput = z.infer<typeof updateTrialLeadSchema>;

export const trialLinkSchema = z.object({
  action: z.enum(["enable", "regenerate", "disable"]),
});
