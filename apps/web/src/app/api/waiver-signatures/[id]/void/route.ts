import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLogStrict } from "@/lib/audit/log";

// POST /api/waiver-signatures/[id]/void — coach/owner. Flow audit 9.3:
// signatures are never edited or deleted; one recorded in error (wrong
// member, or not actually signed) is voided instead, so it stops counting
// and the member can sign again. The DB stamps voided_at/voided_by and
// refuses a second void. RLS (waiver_signatures_update_staff) scopes it to
// the caller's gym. Audit-first, fail-closed.
export const POST = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No signature id provided.");
    const supabase = createClient();

    const { data: sig } = await supabase
      .from("waiver_signatures")
      .select("id, member_id, waiver_version_id, method, voided_at")
      .eq("id", id)
      .maybeSingle();
    if (!sig) return apiError(404, "NOT_FOUND", "That signature wasn't found.");
    if (sig.voided_at) return apiError(409, "ALREADY_VOIDED", "This signature is already voided.");

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "waiver.voided",
      entityType: "members",
      entityId: sig.member_id,
      beforeState: {
        member_id: sig.member_id,
        waiver_version_id: sig.waiver_version_id,
        method: sig.method,
      },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      return apiError(500, "WAIVER_VOID_FAILED", "Something went wrong — nothing was changed.");
    }

    // voided_at's value is replaced by now() in the DB trigger.
    const { data: updated, error } = await supabase
      .from("waiver_signatures")
      .update({ voided_at: new Date().toISOString() })
      .eq("id", id)
      .is("voided_at", null)
      .select("id");
    if (error || !updated || updated.length === 0) {
      console.error("[waiver] void failed after audit", error?.code);
      return apiError(500, "WAIVER_VOID_FAILED", "Something went wrong — nothing was changed.");
    }
    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach" },
);
