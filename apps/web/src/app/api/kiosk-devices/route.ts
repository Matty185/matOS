import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLogStrict } from "@/lib/audit/log";
import { KIOSK_ACTIVATION_HOURS, generateKioskSecret, hashKioskSecret } from "@/lib/kiosk/device";
import { createKioskDeviceSchema } from "@matos/shared";

/** Live (not revoked) kiosk devices per gym. */
const MAX_DEVICES = 5;

// POST /api/kiosk-devices — owner only. Flow audit 4.4: register a
// front-desk tablet. Returns a one-time setup link (24 h); the raw secret is
// returned once and only its hash is stored. Service-role write (no client
// write policy on kiosk_devices), audit-first in effect: the row is revoked
// again if the audit write fails, before the link is ever returned.
export const POST = withAuth(
  async (_request, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "A kiosk is for academies, not personal workspaces.");
    }
    const supabase = createServiceRoleClient();

    const { count, error: countError } = await supabase
      .from("kiosk_devices")
      .select("id", { count: "exact", head: true })
      .eq("gym_id", context.gymId)
      .is("revoked_at", null);
    if (countError) {
      return apiError(500, "KIOSK_CREATE_FAILED", "Something went wrong — no kiosk was added.");
    }
    if ((count ?? 0) >= MAX_DEVICES) {
      return apiError(
        409,
        "TOO_MANY_KIOSKS",
        `You already have ${MAX_DEVICES} kiosks. Remove one you no longer use first.`,
      );
    }

    const secret = generateKioskSecret();
    const expiresAt = new Date(Date.now() + KIOSK_ACTIVATION_HOURS * 3600 * 1000).toISOString();
    const { data: device, error } = await supabase
      .from("kiosk_devices")
      .insert({
        gym_id: context.gymId,
        name: input.name,
        activation_token_hash: hashKioskSecret(secret),
        activation_expires_at: expiresAt,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !device) {
      console.error("[kiosk-devices] insert failed", error?.code);
      return apiError(500, "KIOSK_CREATE_FAILED", "Something went wrong — no kiosk was added.");
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "kiosk_device.created",
      entityType: "kiosk_devices",
      entityId: device.id,
      afterState: { name: input.name, activation_expires_at: expiresAt },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      await supabase
        .from("kiosk_devices")
        .update({ revoked_at: new Date().toISOString(), activation_token_hash: null })
        .eq("id", device.id);
      return apiError(500, "KIOSK_CREATE_FAILED", "Something went wrong — no kiosk was added.");
    }

    // The secret goes in the fragment: browsers never send it to the server
    // in the page request, so it stays out of logs and Referer headers. The
    // setup page posts it to /api/kiosk/activate.
    return NextResponse.json(
      {
        id: device.id,
        url: `${process.env.NEXT_PUBLIC_APP_URL}/kiosk/setup#${secret}`,
        expiresAt,
      },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  },
  { requiredRole: "gym_owner", schema: createKioskDeviceSchema },
);
