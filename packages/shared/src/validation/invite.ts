import { z } from "zod";

// Referenced by the claim route now and by Stage 8's GDPR export/deletion
// flows later — keep this the single source of truth for which consent
// text version a `gdpr_consents` row was captured under.
export const GDPR_CONSENT_VERSION = "1.0";

// Stage O2: "link" mints a fresh single-use claim URL and returns it to the
// coach to share however they like (copy, QR, WhatsApp, their own email);
// "email" sends it via Resend and requires a verified sending domain
// (INVITE_EMAIL_ENABLED server-side). Either way the previous unclaimed
// invite is invalidated — the raw token is never stored, so a link can't
// be "retrieved", only re-minted.
export const INVITE_DELIVERY_VALUES = ["link", "email"] as const;
export type InviteDelivery = (typeof INVITE_DELIVERY_VALUES)[number];

export const createInviteSchema = z.object({
  member_id: z.string().uuid("member_id must be a valid UUID."),
  delivery: z.enum(INVITE_DELIVERY_VALUES).default("link"),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;

// Matches the live Supabase Auth project setting (minimum_password_length
// raised to 8 this stage, see supabase/config.toml) so a weak password is
// rejected here, before ever reaching the Admin API.
export const claimInviteSchema = z
  .object({
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

export type ClaimInviteInput = z.infer<typeof claimInviteSchema>;

// Stage S2 (matos_mobile_plan.md §2.3): "attach flow" — the invited email
// already has an auth.users account (most commonly, a solo signup from
// Stage S2's own signup route). Verifies the *existing* password rather
// than setting a new one — no confirmPassword, since nothing is being set.
export const attachInviteSchema = z.object({
  password: z.string().min(1, "Password is required."),
  consent: z.literal(true, {
    message: "You must accept the data storage consent to continue.",
  }),
});

export type AttachInviteInput = z.infer<typeof attachInviteSchema>;

// Stage O4: mint invite links for several members at once (the members
// list's "Invite selected" → printable QR sheet). Link delivery only.
export const MAX_BULK_INVITES = 100;
export const bulkInviteSchema = z.object({
  member_ids: z
    .array(z.string().uuid())
    .min(1, "Select at least one member.")
    .max(MAX_BULK_INVITES, `At most ${MAX_BULK_INVITES} at a time.`),
});

export type BulkInviteInput = z.infer<typeof bulkInviteSchema>;
