import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Stage S2 (matos_mobile_plan.md §2.3): self-serve solo signup — the first
// account-creation path in this app that isn't gated behind a coach's
// invite. Password rule mirrors claimInviteSchema's (min 8, matches the
// live Supabase Auth project's minimum_password_length setting).
export const signupSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required.").max(100),
    lastName: z.string().trim().min(1, "Last name is required.").max(100),
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
    consent: z.literal(true, {
      message: "You must accept the data storage consent to continue.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export type SignupInput = z.infer<typeof signupSchema>;
