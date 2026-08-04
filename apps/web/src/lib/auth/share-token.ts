import "server-only";
import { randomUUID, createHash } from "node:crypto";

/**
 * Stage S3: share_links tokens follow the exact same pattern as
 * invite-token.ts (random UUIDv4, sha256 hash stored — the raw token is
 * only ever returned to the creating client once, never persisted). No
 * expiry here, unlike invites — matches share_links' own schema (no
 * expires_at column; a share link is permanent until the owner revokes
 * it, which is the correct behaviour for a shareable profile/match link
 * someone might post publicly and want to keep working long-term).
 */
export function generateShareToken(): string {
  return randomUUID();
}

export function hashShareToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
