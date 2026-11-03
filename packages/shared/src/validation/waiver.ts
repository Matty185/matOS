import { z } from "zod";
import { agentQueryField } from "./agent";

// Flow audit 9.3: liability waivers. The owner publishes the text; members
// sign the gym's current version (typed full name + tick); coaches record a
// paper waiver or a parent/guardian signature on their own device.

export const publishWaiverSchema = z.object({
  body: z
    .string()
    .trim()
    .min(20, "The waiver needs at least a couple of sentences.")
    .max(20000, "Keep the waiver under 20,000 characters."),
  agent_query: agentQueryField,
});

export type PublishWaiverInput = z.infer<typeof publishWaiverSchema>;

const signerName = z
  .string()
  .trim()
  .min(2, "Type the full name.")
  .max(100, "Keep the name under 100 characters.");

/** A member signing for themselves. */
export const signWaiverSchema = z.object({
  waiver_version_id: z.string().uuid(),
  signer_name: signerName,
  agree: z.literal(true, { message: "Tick the box to agree." }),
});

export type SignWaiverInput = z.infer<typeof signWaiverSchema>;

/** A coach recording a guardian signature or a paper waiver. */
export const recordWaiverSchema = z
  .object({
    waiver_version_id: z.string().uuid(),
    method: z.enum(["guardian", "paper"]),
    signer_name: z
      .string()
      .trim()
      .max(100, "Keep the name under 100 characters.")
      .optional()
      .transform((v) => (v ? v : undefined)),
    agree: z.boolean().optional(),
    agent_query: agentQueryField,
  })
  .superRefine((v, ctx) => {
    if (v.method === "guardian") {
      if (!v.signer_name || v.signer_name.length < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["signer_name"],
          message: "Type the parent or guardian's full name.",
        });
      }
      if (v.agree !== true) {
        ctx.addIssue({ code: "custom", path: ["agree"], message: "Tick the box to agree." });
      }
    } else if (v.signer_name !== undefined && v.signer_name.length < 2) {
      ctx.addIssue({ code: "custom", path: ["signer_name"], message: "Type the full name." });
    }
  });

export type RecordWaiverInput = z.infer<typeof recordWaiverSchema>;
