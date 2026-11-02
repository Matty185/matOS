import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { mapMemberGuardError } from "@/lib/api/member-guards";
import { reactivateMemberSchema } from "@matos/shared";

// POST /api/members/[id]/reactivate — coach/owner. The undo for
// .../deactivate (a member back from injury or travel). Same shape as
// deactivate: RLS scopes the read to the caller's gym, the conditional
// update makes it atomic, and the members_staff_active_guard trigger only
// lets an owner reactivate a coach/owner row.
//
// Never for a GDPR-erased member: their row was anonymised in place and
// left inactive, and bringing it back would resurrect a "Deleted Member"
// with none of their data. An executed deletion request is the marker.
export const POST = withAuth(
  async (_request: NextRequest, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No member id provided.");

    const supabase = createClient();
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("active, email")
      .eq("id", id)
      .single();
    if (memberError || !member) {
      return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your gym.");
    }
    if (member.active) {
      return apiError(409, "ALREADY_ACTIVE", "This member is already active.");
    }

    const { data: erased, error: erasedError } = await supabase
      .from("deletion_requests")
      .select("id")
      .eq("member_id", id)
      .not("executed_at", "is", null)
      .limit(1);
    if (erasedError) {
      console.error("[reactivate] deletion-request check failed", erasedError);
      return apiError(500, "REACTIVATE_FAILED", "Something went wrong — the change wasn't saved.");
    }
    // Also catch an erasure interrupted before executed_at was stamped: the
    // anonymised row carries this placeholder email.
    const anonymised = /^deleted-.*@anonymized\.invalid$/.test(member.email ?? "");
    if (anonymised || (erased && erased.length > 0)) {
      return apiError(
        409,
        "MEMBER_ERASED",
        "This member's data was deleted at their request, so they can't be reactivated. Add them again as a new member.",
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("members")
      .update({ active: true })
      .eq("id", id)
      .eq("active", false)
      .select("id");
    if (updateError) {
      const mapped = mapMemberGuardError(updateError);
      if (mapped) return mapped;
      return apiError(500, "REACTIVATE_FAILED", "Something went wrong — the change wasn't saved.");
    }
    if (!updated || updated.length === 0) {
      return apiError(409, "ALREADY_ACTIVE", "This member is already active.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.reactivated",
      entityType: "members",
      entityId: id,
      beforeState: { active: false },
      afterState: { active: true },
      initiatedBy: "coach_manual",
    });

    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach", schema: reactivateMemberSchema },
);
