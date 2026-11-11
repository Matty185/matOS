import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLogStrict } from "@/lib/audit/log";
import {
  encryptWebhookSecret,
  generateEndpointId,
  paymentsKeyConfigured,
} from "@/lib/stripe/webhook-secret";
import { STRIPE_WEBHOOK_SECRET, stripeWebhookSecretSchema } from "@matos/shared";

// /api/gym/stripe-webhook — owner only. Stage L2: connect the academy's own
// Stripe account so online payments mark months paid automatically.
//   POST   → create the webhook URL (no secret yet), or return the existing one
//   PUT    → save the signing secret Stripe shows for that URL (encrypted)
//   DELETE → disconnect (the URL stops working; a new setup gets a new URL)
// Service role: gym_stripe_webhooks has no client write policy (Rule 4).
// Every change is audited strictly; the secret itself never is.

function webhookUrl(endpointId: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/stripe/webhook/${endpointId}`;
}

function refuse(context: AuthContext): Response | null {
  if (context.gymKind === "personal") {
    return apiError(
      403,
      "FORBIDDEN",
      "Online payments are for academies, not personal workspaces.",
    );
  }
  return null;
}

export const POST = withAuth(
  async (_request, context) => {
    const refused = refuse(context);
    if (refused) return refused;
    const supabase = createServiceRoleClient();
    const { data: existing, error: readError } = await supabase
      .from("gym_stripe_webhooks")
      .select("endpoint_id")
      .eq("gym_id", context.gymId)
      .maybeSingle();
    if (readError) {
      return apiError(500, "STRIPE_SETUP_FAILED", "Something went wrong. Try again.");
    }
    if (existing) {
      return NextResponse.json(
        { url: webhookUrl(existing.endpoint_id) },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const endpointId = generateEndpointId();
    const { data: row, error } = await supabase
      .from("gym_stripe_webhooks")
      .insert({ gym_id: context.gymId, endpoint_id: endpointId, created_by: context.userId })
      .select("id")
      .single();
    if (error || !row) {
      console.error("[stripe-webhook-setup] insert failed", error?.code);
      return apiError(500, "STRIPE_SETUP_FAILED", "Something went wrong. Try again.");
    }
    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "stripe_webhook.created",
      entityType: "gym_stripe_webhooks",
      entityId: row.id,
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      await supabase.from("gym_stripe_webhooks").delete().eq("id", row.id);
      return apiError(500, "STRIPE_SETUP_FAILED", "Something went wrong. Try again.");
    }
    return NextResponse.json(
      { url: webhookUrl(endpointId) },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  },
  { requiredRole: "gym_owner" },
);

export const PUT = withAuth(
  async (_request, context, input) => {
    const refused = refuse(context);
    if (refused) return refused;
    if (!paymentsKeyConfigured()) {
      console.error("[stripe-webhook-setup] PAYMENTS_SECRET_KEY missing or not 32 bytes");
      return apiError(
        503,
        "NOT_CONFIGURED",
        "Online payments aren't switched on for MatOS yet. Contact MatOS support.",
      );
    }
    // Belt and braces: the schema already checked the shape.
    if (!STRIPE_WEBHOOK_SECRET.test(input.secret)) {
      return apiError(400, "VALIDATION_ERROR", "Paste the signing secret from Stripe.");
    }
    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase
      .from("gym_stripe_webhooks")
      .select("id, signing_secret_ciphertext, connected_at")
      .eq("gym_id", context.gymId)
      .maybeSingle();
    if (!existing) {
      return apiError(409, "NOT_SET_UP", "Create the webhook address first.");
    }
    const ciphertext = encryptWebhookSecret(input.secret, context.gymId);
    if (!ciphertext) {
      return apiError(503, "NOT_CONFIGURED", "Online payments aren't switched on for MatOS yet.");
    }
    const connectedAt = new Date().toISOString();
    const { error } = await supabase
      .from("gym_stripe_webhooks")
      .update({ signing_secret_ciphertext: ciphertext, connected_at: connectedAt })
      .eq("id", existing.id);
    if (error) {
      console.error("[stripe-webhook-setup] secret update failed", error.code);
      return apiError(500, "STRIPE_SETUP_FAILED", "Something went wrong. The secret wasn't saved.");
    }
    const replaced = existing.signing_secret_ciphertext !== null;
    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: replaced ? "stripe_webhook.secret_replaced" : "stripe_webhook.connected",
      entityType: "gym_stripe_webhooks",
      entityId: existing.id,
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      await supabase
        .from("gym_stripe_webhooks")
        .update({
          signing_secret_ciphertext: existing.signing_secret_ciphertext,
          connected_at: existing.connected_at,
        })
        .eq("id", existing.id);
      return apiError(500, "STRIPE_SETUP_FAILED", "Something went wrong. The secret wasn't saved.");
    }
    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
  { requiredRole: "gym_owner", schema: stripeWebhookSecretSchema },
);

export const DELETE = withAuth(
  async (_request, context) => {
    const refused = refuse(context);
    if (refused) return refused;
    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase
      .from("gym_stripe_webhooks")
      .select("id, connected_at, last_event_at")
      .eq("gym_id", context.gymId)
      .maybeSingle();
    if (!existing) return NextResponse.json({ success: true });

    // Audit first: once the row is gone there's nothing to revert.
    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "stripe_webhook.disconnected",
      entityType: "gym_stripe_webhooks",
      entityId: existing.id,
      beforeState: {
        connected_at: existing.connected_at,
        last_event_at: existing.last_event_at,
      },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      return apiError(500, "STRIPE_SETUP_FAILED", "Something went wrong. Nothing was changed.");
    }
    const { error } = await supabase.from("gym_stripe_webhooks").delete().eq("id", existing.id);
    if (error) {
      console.error("[stripe-webhook-setup] delete failed", error.code);
      return apiError(500, "STRIPE_SETUP_FAILED", "Something went wrong. Try again.");
    }
    return NextResponse.json({ success: true });
  },
  { requiredRole: "gym_owner" },
);
