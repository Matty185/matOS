import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLogStrict } from "@/lib/audit/log";

// POST /api/members/[id]/reject — coach/owner. Turn down a sign-up from the
// permanent join QR code: remove the pending member row and, if the login
// was made for this sign-up and belongs nowhere else, the login too. This is
// the one place a member row is deleted rather than deactivated: a pending
// sign-up was never a member, and keeping the login would leave whoever
// scanned the poster with an account for an email that may not be theirs.
//
// The RLS read confirms the row is in the caller's academy. The deletion is
// one transaction in reject_pending_signup (service role only), which
// re-checks it's still pending under a row lock and refuses if anything has
// been recorded against it, so nothing is half-deleted. Audit first, since a
// deletion can't be reverted.
export const POST = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No member id provided.");

    const supabase = createClient();
    const { data: member } = await supabase
      .from("members")
      .select("id, gym_id, pending_approval")
      .eq("id", id)
      .maybeSingle();
    if (!member || member.gym_id !== context.gymId) {
      return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your academy.");
    }
    if (!member.pending_approval) {
      return apiError(409, "NOT_PENDING", "This sign-up isn't waiting for approval any more.");
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.signup_rejected",
      entityType: "members",
      entityId: member.id,
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      return apiError(500, "REJECT_FAILED", "Something went wrong. Nothing was removed.");
    }

    const service = createServiceRoleClient();
    const { data: userId, error } = await service.rpc("reject_pending_signup", {
      p_member_id: member.id,
      p_gym_id: context.gymId,
    });
    if (error) {
      if (error.hint === "NOT_PENDING") {
        return apiError(409, "NOT_PENDING", "This sign-up isn't waiting for approval any more.");
      }
      if (error.hint === "HAS_RECORDS") {
        return apiError(
          409,
          "HAS_RECORDS",
          "Something has already been recorded for this person (attendance, a payment or an invite), so they can't be removed. Approve them, or leave them waiting.",
        );
      }
      console.error("[reject] failed", error.code);
      return apiError(500, "REJECT_FAILED", "Something went wrong. Nothing was removed.");
    }

    // The login: only if it now belongs to no academy at all.
    if (userId) {
      const { count, error: countError } = await service
        .from("members")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (!countError && (count ?? 0) === 0) {
        const { error: userError } = await service.auth.admin.deleteUser(userId);
        if (userError) console.error("[reject] failed to delete auth user", userError.message);
      }
    }

    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach" },
);
