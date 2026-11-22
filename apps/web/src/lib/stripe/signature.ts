import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** Stripe's own default tolerance for a signed timestamp. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Verifies a Stripe-Signature header ("t=<unix>,v1=<hex>[,v1=...]") the way
 * Stripe documents it: HMAC-SHA256 of "<t>.<raw body>" with the endpoint's
 * signing secret, compared in constant time against every v1 value, and the
 * timestamp within the tolerance. Done by hand rather than with the stripe
 * npm package to avoid a large dependency for ~20 lines.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!header || header.length > 2000) return false;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === "t" && /^\d{1,12}$/.test(v)) timestamp = Number(v);
    if (k === "v1" && /^[0-9a-f]{64}$/.test(v)) signatures.push(v);
  }
  if (timestamp === null || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  return signatures.some((s) => {
    const given = Buffer.from(s, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
