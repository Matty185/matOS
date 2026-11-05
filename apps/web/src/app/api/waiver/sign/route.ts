import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { mapWaiverSignatureError } from "@/lib/api/waiver-errors";
import { signWaiverSchema } from "@matos/shared";

// POST /api/waiver/sign — any signed-in member, for themselves. Flow audit
// 9.3: they typed their full name and ticked "I agree" on the gym's current
// waiver. RLS (waiver_signatures_insert_self) only allows method 'self' for
// the caller's own member row; the DB trigger refuses a superseded version.
// Audit is best effort, like self check-in: the signature row itself is the
// record.
export const POST = withAuth(
  async (_request: NextRequest, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Waivers are for academies, not personal workspaces.");
    }
    const supabase = createClient();

    const { data: created, error } = await supabase
      .from("waiver_signatures")
      .insert({
        gym_id: context.gymId, // derived from the member by trigger
        member_id: context.memberId,
        waiver_version_id: input.waiver_version_id,
        method: "self",
        signer_name: input.signer_name,
      })
      .select("id, signed_at")
      .single();
    const mapped = mapWaiverSignatureError(error);
    if (mapped) return mapped;
    if (error || !created) {
      console.error("[waiver] sign failed", error?.code);
      return apiError(
        500,
        "WAIVER_SIGN_FAILED",
        "Something went wrong — the waiver wasn't signed.",
      );
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "waiver.signed",
      entityType: "waiver_signatures",
      entityId: created.id,
      afterState: { member_id: context.memberId, waiver_version_id: input.waiver_version_id },
      initiatedBy: "self_service",
    });

    return NextResponse.json({ success: true, signedAt: created.signed_at }, { status: 201 });
  },
  { schema: signWaiverSchema },
);
