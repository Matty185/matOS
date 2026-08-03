import "server-only";
import { randomUUID, createHash } from "node:crypto";

const INVITE_EXPIRY_DAYS = 7;
export const MAX_INVITE_ATTEMPTS = 5;

/** Random UUIDv4 raw token per plan §5. Only ever emailed, never stored. */
export function generateInviteToken(): string {
  return randomUUID();
}

/** SHA-256 hex digest — what's actually stored in invites.token_hash. */
export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function inviteExpiryDate(): string {
  const expires = new Date();
  expires.setDate(expires.getDate() + INVITE_EXPIRY_DAYS);
  return expires.toISOString();
}
