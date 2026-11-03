import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLogStrict } from "@/lib/audit/log";

// POST /api/kiosk-devices/[id]/revoke — owner only. Flow audit 4.4: stop a
// tablet working as a kiosk (lost, replaced, or the setup link went to the
// wrong person). Takes effect on the tablet's next request. The row is kept
// (revoked_at) for the audit trail. Audit-first, fail-closed.
export const POST = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No kiosk id provided.");
    const supabase = createServiceRoleClient();

    // Scoped to the caller's gym explicitly: the service-role client
    // bypasses RLS.
    const { data: device } = await supabase
      .from("kiosk_devices")
      .select("id, name, revoked_at")
      .eq("id", id)
      .eq("gym_id", context.gymId)
      .maybeSingle();
    if (!device) return apiError(404, "NOT_FOUND", "That kiosk wasn't found.");
    if (device.revoked_at) return NextResponse.json({ success: true });

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "kiosk_device.revoked",
      entityType: "kiosk_devices",
      entityId: device.id,
      beforeState: { name: device.name },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      return apiError(500, "REVOKE_FAILED", "Something went wrong — the kiosk still works.");
    }

    const { error } = await supabase
      .from("kiosk_devices")
      .update({ revoked_at: new Date().toISOString(), activation_token_hash: null })
      .eq("id", device.id)
      .eq("gym_id", context.gymId);
    if (error) {
      console.error("[kiosk-devices] revoke failed after audit", error.code);
      return apiError(500, "REVOKE_FAILED", "Something went wrong — the kiosk still works.");
    }
    return NextResponse.json({ success: true });
  },
  { requiredRole: "gym_owner" },
);
