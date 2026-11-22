import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLogStrict } from "@/lib/audit/log";

// POST /api/members/[id]/approve — coach/owner. Someone who signed up with
// the permanent join QR code becomes an active member. RLS scopes the update
// to the caller's academy; the condition on pending_approval makes it a
// no-op for anyone else. Audited strictly: reverted if the audit row fails.
export const POST = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No member id provided.");

    const supabase = createClient();
    const { data: updated, error } = await supabase
      .from("members")
      .update({ active: true, pending_approval: false })
      .eq("id", id)
      .eq("pending_approval", true)
      .select("id, first_name, last_name")
      .maybeSingle();
    if (error) {
      console.error("[approve] update failed", error.code);
      return apiError(500, "APPROVE_FAILED", "Something went wrong. They weren't approved.");
    }
    if (!updated) {
      return apiError(404, "NOT_PENDING", "This sign-up isn't waiting for approval any more.");
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.signup_approved",
      entityType: "members",
      entityId: updated.id,
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      // Back to pending (only the service role may set it).
      await createServiceRoleClient()
        .from("members")
        .update({ active: false, pending_approval: true })
        .eq("id", updated.id);
      return apiError(500, "APPROVE_FAILED", "Something went wrong. They weren't approved.");
    }

    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach" },
);
