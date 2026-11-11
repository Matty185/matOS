import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Stage L2: each gym's Stripe webhook signing secret is stored only as
 * AES-256-GCM ciphertext under PAYMENTS_SECRET_KEY (32 random bytes,
 * base64), set once in Vercel. The gym id is bound in as associated data,
 * so a ciphertext copied onto another gym's row doesn't decrypt.
 *
 * Stored form: "v1.<iv>.<tag>.<ciphertext>", each part base64url.
 */

function key(): Buffer | null {
  const raw = process.env.PAYMENTS_SECRET_KEY;
  if (!raw) return null;
  const buf = Buffer.from(raw.trim(), "base64");
  return buf.length === 32 ? buf : null;
}

export function paymentsKeyConfigured(): boolean {
  return key() !== null;
}

/** New public id for a webhook URL (128 random bits, base64url, 22 chars). */
export function generateEndpointId(): string {
  return randomBytes(16).toString("base64url");
}

export function encryptWebhookSecret(secret: string, gymId: string): string | null {
  const k = key();
  if (!k) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  cipher.setAAD(Buffer.from(gymId, "utf8"));
  const ct = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(
    ".",
  );
}

/** The plain secret, or null if the key is missing or the value was tampered with. */
export function decryptWebhookSecret(stored: string, gymId: string): string | null {
  const k = key();
  if (!k) return null;
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const iv = Buffer.from(parts[1]!, "base64url");
    const tag = Buffer.from(parts[2]!, "base64url");
    const ct = Buffer.from(parts[3]!, "base64url");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", k, iv);
    decipher.setAAD(Buffer.from(gymId, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
