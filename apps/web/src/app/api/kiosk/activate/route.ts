import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLog } from "@/lib/audit/log";
import { generateKioskSecret, hashKioskSecret, setKioskCookie } from "@/lib/kiosk/device";
import { kioskActivateSchema } from "@matos/shared";

// POST /api/kiosk/activate — public. Flow audit 4.4: the tablet exchanges
// the owner's one-time setup secret for a long-lived device key, set as an
// httpOnly cookie. One conditional UPDATE does the exchange, so two tablets
// opening the same link can't both become kiosks, and a used, expired or
// revoked link does nothing. Service role: the tablet has no session.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = kioskActivateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "INVALID_LINK", "That setup link isn't valid.");
  }

  const supabase = createServiceRoleClient();
  const deviceSecret = generateKioskSecret();
  const now = new Date().toISOString();
  const { data: device, error } = await supabase
    .from("kiosk_devices")
    .update({
      activated_at: now,
      last_seen_at: now,
      device_token_hash: hashKioskSecret(deviceSecret),
      activation_token_hash: null,
    })
    .eq("activation_token_hash", hashKioskSecret(parsed.data.token))
    .is("activated_at", null)
    .is("revoked_at", null)
    .gt("activation_expires_at", now)
    .select("id, gym_id, name, gyms(name, kind, active)")
    .maybeSingle();
  if (error) {
    console.error("[kiosk] activate failed", error.code);
    return apiError(500, "ACTIVATE_FAILED", "Something went wrong — try the link again.");
  }
  const gym = (device as { gyms: { name: string; kind: string; active: boolean } | null } | null)
    ?.gyms;
  if (!device || !gym || gym.kind !== "gym" || !gym.active) {
    return apiError(
      410,
      "LINK_UNAVAILABLE",
      "This setup link has already been used or has expired. Ask the academy owner for a new one.",
    );
  }

  await writeAuditLog({
    gymId: device.gym_id,
    actorId: null,
    action: "kiosk_device.activated",
    entityType: "kiosk_devices",
    entityId: device.id,
    afterState: { name: device.name },
    initiatedBy: "kiosk",
  });

  const response = NextResponse.json(
    { success: true, gymName: gym.name, deviceName: device.name },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  setKioskCookie(response, deviceSecret);
  return response;
}
