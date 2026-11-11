import { NextResponse, type NextRequest } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { decryptWebhookSecret } from "@/lib/stripe/webhook-secret";
import { verifyStripeSignature } from "@/lib/stripe/signature";
import { parsePaymentReference } from "@/lib/stripe/reference";
import { loadFeeContext, monthlyFee } from "@/lib/payments/fees";

// POST /api/stripe/webhook/[endpointId] — PUBLIC (Stripe calls it). Stage
// L2 (matos_payment_links_plan.md): a member paid through the academy's own
// Payment Link, so mark the month paid.
//
// Service role (CLAUDE.md Rule 4, same category as kiosk and trial
// requests). The endpoint id in the URL decides the gym, and only after the
// Stripe-Signature header verifies against that gym's own signing secret;
// nothing in the payload can point at another gym. The payment reference
// only picks a member inside that gym.
//
// Replies 200 for everything handled or deliberately ignored (so Stripe
// doesn't retry forever), 400 only for a bad signature or body, and 5xx
// when something failed and a retry could help.

const HANDLED = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
]);
const MAX_BODY_BYTES = 256 * 1024;
const MAX_EVENTS_PER_MINUTE = 120;
const ENDPOINT_ID = /^[A-Za-z0-9_-]{22,64}$/;
const EVENT_ID = /^evt_[A-Za-z0-9]{8,255}$/;
const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{8,255}$/;

function ok(body: Record<string, string>) {
  return NextResponse.json(body, { status: 200, headers: { "Cache-Control": "no-store" } });
}

type CheckoutSession = {
  object?: unknown;
  id?: unknown;
  client_reference_id?: unknown;
  payment_status?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  customer_details?: { email?: unknown } | null;
};

export async function POST(request: NextRequest, { params }: { params: { endpointId: string } }) {
  noStore();
  const endpointId = params.endpointId;
  if (!ENDPOINT_ID.test(endpointId)) {
    return apiError(404, "NOT_FOUND", "Unknown webhook.");
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return apiError(413, "TOO_LARGE", "Body too large.");
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return apiError(413, "TOO_LARGE", "Body too large.");
  }

  const supabase = createServiceRoleClient();
  const { data: hook, error: hookError } = await supabase
    .from("gym_stripe_webhooks")
    .select("gym_id, signing_secret_ciphertext, gyms(kind, active)")
    .eq("endpoint_id", endpointId)
    .maybeSingle();
  if (hookError) {
    console.error("[stripe-webhook] lookup failed", hookError.code);
    return apiError(500, "WEBHOOK_FAILED", "Try again.");
  }
  const gym = (hook as { gyms: { kind: string; active: boolean } | null } | null)?.gyms;
  if (!hook || !hook.signing_secret_ciphertext || !gym || gym.kind !== "gym" || !gym.active) {
    return apiError(404, "NOT_FOUND", "Unknown webhook.");
  }

  const secret = decryptWebhookSecret(hook.signing_secret_ciphertext, hook.gym_id);
  if (!secret) {
    // Missing or wrong PAYMENTS_SECRET_KEY: a server problem, so let Stripe retry.
    console.error("[stripe-webhook] signing secret could not be decrypted");
    return apiError(500, "WEBHOOK_FAILED", "Try again.");
  }
  if (!verifyStripeSignature(rawBody, request.headers.get("stripe-signature"), secret)) {
    return apiError(400, "BAD_SIGNATURE", "Signature check failed.");
  }

  let event: {
    id?: unknown;
    type?: unknown;
    livemode?: unknown;
    data?: { object?: CheckoutSession };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return apiError(400, "BAD_BODY", "Body isn't JSON.");
  }
  if (typeof event.type !== "string" || !HANDLED.has(event.type)) {
    return ok({ received: "ignored" });
  }
  const session = event.data?.object;
  if (
    typeof event.id !== "string" ||
    !EVENT_ID.test(event.id) ||
    !session ||
    session.object !== "checkout.session" ||
    typeof session.id !== "string" ||
    !SESSION_ID.test(session.id)
  ) {
    return ok({ received: "ignored" });
  }

  const { count: recent, error: rateError } = await supabase
    .from("payment_events")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", hook.gym_id)
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if (rateError) return apiError(500, "WEBHOOK_FAILED", "Try again.");
  if ((recent ?? 0) >= MAX_EVENTS_PER_MINUTE) {
    // Stripe retries later with backoff.
    return apiError(429, "SLOW_DOWN", "Too many events.");
  }

  // Find the member: the reference's 8-character id prefix, within this gym
  // only. More than one match (or none) is left for the coach to sort out.
  const reference =
    typeof session.client_reference_id === "string" ? session.client_reference_id : null;
  const parsed = parsePaymentReference(reference);
  let memberId: string | null = null;
  let expectedCents: number | null = null;
  if (parsed) {
    // The prefix is the uuid's first 8 hex digits, so every match lies in
    // one uuid range: an indexed lookup, at most two rows, any roster size.
    const p = parsed.idPrefix;
    const { data: matches, error: membersError } = await supabase
      .from("members")
      .select("id")
      .eq("gym_id", hook.gym_id)
      .gte("id", `${p}-0000-0000-0000-000000000000`)
      .lte("id", `${p}-ffff-ffff-ffff-ffffffffffff`)
      .limit(2);
    if (membersError) return apiError(500, "WEBHOOK_FAILED", "Try again.");
    if (matches && matches.length === 1) memberId = matches[0]!.id;
  }

  // A month far from today is more likely a tampered reference than a real
  // payment: leave it for the coach rather than mark it.
  let periodMonth: number | null = null;
  let periodYear: number | null = null;
  if (parsed?.kind === "month") {
    const now = new Date();
    const diff =
      parsed.year * 12 + parsed.month - (now.getUTCFullYear() * 12 + now.getUTCMonth() + 1);
    if (diff >= -24 && diff <= 12) {
      periodMonth = parsed.month;
      periodYear = parsed.year;
    }
  }

  if (memberId && periodMonth !== null) {
    try {
      const fees = await loadFeeContext(supabase, hook.gym_id);
      const fee = monthlyFee(fees, memberId);
      if (fee) expectedCents = Math.round(fee.amount * 100);
    } catch {
      return apiError(500, "WEBHOOK_FAILED", "Try again.");
    }
  }

  const amountCents =
    typeof session.amount_total === "number" &&
    Number.isSafeInteger(session.amount_total) &&
    session.amount_total >= 0
      ? session.amount_total
      : null;
  const currency =
    typeof session.currency === "string" && /^[a-z]{3}$/.test(session.currency)
      ? session.currency
      : null;
  const payerEmail =
    typeof session.customer_details?.email === "string"
      ? session.customer_details.email.trim().toLowerCase()
      : null;

  const { data: outcome, error: rpcError } = await supabase.rpc("record_stripe_payment", {
    p_gym_id: hook.gym_id,
    p_event_id: event.id,
    p_event_type: event.type,
    p_session_id: session.id,
    p_livemode: event.livemode === true,
    p_payment_status: typeof session.payment_status === "string" ? session.payment_status : null,
    p_member_id: memberId,
    p_period_month: periodMonth,
    p_period_year: periodYear,
    p_is_class: parsed?.kind === "class",
    p_amount_cents: amountCents,
    p_currency: currency,
    p_expected_cents: expectedCents,
    p_reference: reference ? reference.slice(0, 200) : null,
    p_payer_email: payerEmail ? payerEmail.slice(0, 320) : null,
  });
  if (rpcError) {
    console.error("[stripe-webhook] record failed", rpcError.code);
    return apiError(500, "WEBHOOK_FAILED", "Try again.");
  }
  return ok({ received: String(outcome) });
}
