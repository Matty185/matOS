import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLogStrict } from "@/lib/audit/log";
import { mapWaiverSignatureError } from "@/lib/api/waiver-errors";
import { recordWaiverSchema } from "@matos/shared";

// POST /api/members/[id]/waiver — coach/owner. Flow audit 9.3: record a
// waiver for someone without their own login (kids, or anyone in person):
// 'guardian' = a parent/guardian read and signed on this device (typed name
// + tick), 'paper' = a paper waiver is on file. RLS
// (waiver_signatures_insert_staff) allows only these two methods, in the
// caller's gym. Audit-first, fail-closed: these are records made on someone
// else's behalf.
export const POST = withAuth(
  async (_request: NextRequest, context, input, params) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Waivers are for academies, not personal workspaces.");
    }
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No member id provided.");
    const supabase = createClient();

    const { data: member } = await supabase
      .from("members")
      .select("id, active")
      .eq("id", id)
      .maybeSingle();
    if (!member) {
      return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your academy.");
    }
    if (!member.active) {
      return apiError(409, "MEMBER_INACTIVE", "Reactivate this member first.");
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "waiver.recorded",
      entityType: "members",
      entityId: id,
      afterState: {
        member_id: id,
        waiver_version_id: input.waiver_version_id,
        method: input.method,
      },
      initiatedBy: input.agent_query ? "agent" : "coach_manual",
      agentQuery: input.agent_query ?? null,
    });
    if (!audited) {
      return apiError(500, "WAIVER_RECORD_FAILED", "Something went wrong — nothing was saved.");
    }

    const { data: created, error } = await supabase
      .from("waiver_signatures")
      .insert({
        gym_id: context.gymId, // derived from the member by trigger
        member_id: id,
        waiver_version_id: input.waiver_version_id,
        method: input.method,
        signer_name: input.signer_name ?? null,
      })
      .select("id")
      .single();
    const mapped = mapWaiverSignatureError(error);
    if (mapped) return mapped;
    if (error || !created) {
      console.error("[waiver] record failed after audit", error?.code);
      return apiError(500, "WAIVER_RECORD_FAILED", "Something went wrong — nothing was saved.");
    }

    return NextResponse.json({ success: true, signatureId: created.id }, { status: 201 });
  },
  { requiredRole: "coach", schema: recordWaiverSchema },
);
