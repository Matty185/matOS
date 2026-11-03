import "server-only";
import { randomBytes, createHash } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Flow audit 4.4: front-desk kiosk devices. The tablet has no auth user;
 * it proves it is a registered kiosk with a device key held in an httpOnly
 * cookie. Only the sha256 of each secret is stored (kiosk_devices).
 */
export const KIOSK_COOKIE = "matos_kiosk";
/**
 * How long the device cookie lives without use. Re-issued on every
 * /api/kiosk/today call (the screen polls it), so a kiosk in daily use never
 * expires, while a copied cookie left unused dies after 90 days. Revoking the
 * device ends it immediately.
 */
export const KIOSK_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
/** How long a setup link stays usable. */
export const KIOSK_ACTIVATION_HOURS = 24;

export function generateKioskSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashKioskSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export type KioskDevice = {
  id: string;
  gymId: string;
  gymName: string;
  timeZone: string;
  /** The raw device key from the cookie, so a route can re-issue it. */
  secret: string;
};

export function setKioskCookie(response: NextResponse, secret: string) {
  response.cookies.set({
    name: KIOSK_COOKIE,
    value: secret,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: KIOSK_COOKIE_MAX_AGE,
  });
}

/**
 * The kiosk calling this request, or null. Refused when the device is
 * revoked or not yet activated, or its gym is no longer an active real gym.
 * Uses the service-role client: there is no session to scope RLS to, so the
 * device row's gym_id is the scope every kiosk route must apply itself.
 */
export async function resolveKioskDevice(request: NextRequest): Promise<KioskDevice | null> {
  // Next's data cache would otherwise keep serving the device row (and so a
  // revoked kiosk keeps working) on GET routes — found in live testing, the
  // same gap Stage S3 hit. Opts the whole request out of fetch caching.
  noStore();
  const secret = request.cookies.get(KIOSK_COOKIE)?.value;
  if (!secret || secret.length > 200) return null;

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("kiosk_devices")
    .select(
      "id, gym_id, last_seen_at, revoked_at, activated_at, gyms(name, kind, active, timezone)",
    )
    .eq("device_token_hash", hashKioskSecret(secret))
    .maybeSingle();
  const row = data as {
    id: string;
    gym_id: string;
    last_seen_at: string | null;
    revoked_at: string | null;
    activated_at: string | null;
    gyms: { name: string; kind: string; active: boolean; timezone: string } | null;
  } | null;
  if (!row || row.revoked_at || !row.activated_at) return null;
  if (!row.gyms || row.gyms.kind !== "gym" || !row.gyms.active) return null;

  // "Last seen" for the owner's device list; at most one write per 5 min.
  const seen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
  if (Date.now() - seen > 5 * 60 * 1000) {
    await supabase
      .from("kiosk_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  return {
    id: row.id,
    gymId: row.gym_id,
    gymName: row.gyms.name,
    timeZone: row.gyms.timezone,
    secret,
  };
}
