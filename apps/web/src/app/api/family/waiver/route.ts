import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { mapWaiverSignatureError } from "@/lib/api/waiver-errors";
import { loadLinkedChild } from "@/lib/family/guardian-link";
import { familyWaiverSchema } from "@matos/shared";

// POST /api/family/waiver — a linked parent signs the gym's current waiver
// for their child (typed name + tick). Flow audit 8.2 + 9.3. RLS
// (waiver_signatures_insert_guardian: linked guardian, method 'guardian')
// and the signature triggers (current version only, gym, signed_at = now)
// are the real gates. Audit best effort; the signature row is the record.
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();
    const child = await loadLinkedChild(supabase, context.memberId, input.member_id);
    if (!child || child.gym_id !== context.gymId) {
      return apiError(404, "NOT_FOUND", "You're not linked to that member.");
    }

    const { data: created, error } = await supabase
      .from("waiver_signatures")
      .insert({
        gym_id: context.gymId, // derived from the member by trigger
        member_id: child.id,
        waiver_version_id: input.waiver_version_id,
        method: "guardian",
        signer_name: input.signer_name,
      })
      .select("id")
      .single();
    const mapped = mapWaiverSignatureError(error);
    if (mapped) return mapped;
    if (error || !created) {
      console.error("[family] waiver sign failed", error?.code);
      return apiError(
        500,
        "WAIVER_SIGN_FAILED",
        "Something went wrong — the waiver wasn't signed.",
      );
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "waiver.signed_by_guardian",
      entityType: "waiver_signatures",
      entityId: created.id,
      afterState: { member_id: child.id, waiver_version_id: input.waiver_version_id },
      initiatedBy: "self_service",
    });

    return NextResponse.json({ success: true }, { status: 201 });
  },
  { schema: familyWaiverSchema },
);
