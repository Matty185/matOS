import { z } from "zod";
import { agentQueryField } from "./agent";

// Flow audit 8.2: parent accounts (guardian role) managing children.

/** Coach adds (or links) a parent for a child. The email becomes their login. */
export const addGuardianSchema = z.object({
  first_name: z.string().trim().min(1, "Enter a first name.").max(100),
  last_name: z.string().trim().min(1, "Enter a last name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter the parent's email address."),
  agent_query: agentQueryField,
});

export type AddGuardianInput = z.infer<typeof addGuardianSchema>;

/** A parent checks a linked child in. */
export const familyCheckInSchema = z.object({
  member_id: z.string().uuid(),
  class_id: z.string().uuid(),
});

/** A parent signs the gym's current waiver for a linked child. */
export const familyWaiverSchema = z.object({
  member_id: z.string().uuid(),
  waiver_version_id: z.string().uuid(),
  signer_name: z.string().trim().min(2, "Type your full name.").max(100),
  agree: z.literal(true, { message: "Tick the box to agree." }),
});
