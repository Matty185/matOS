import { z } from "zod";

// Stage L2: the signing secret Stripe shows for a webhook endpoint
// ("Signing secret", whsec_...). Checked again server-side before it is
// encrypted and stored.
export const STRIPE_WEBHOOK_SECRET = /^whsec_[A-Za-z0-9+/=_-]{16,200}$/;

export const stripeWebhookSecretSchema = z.object({
  secret: z
    .string()
    .trim()
    .regex(STRIPE_WEBHOOK_SECRET, "Paste the signing secret from Stripe. It starts with whsec_."),
});

export type StripeWebhookSecretInput = z.infer<typeof stripeWebhookSecretSchema>;

export const reviewPaymentEventSchema = z.object({
  reviewed: z.boolean(),
});
