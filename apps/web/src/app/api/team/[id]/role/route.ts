import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLogStrict } from "@/lib/audit/log";
import { mapMemberGuardError } from "@/lib/api/member-guards";
import { changeRoleSchema } from "@matos/shared";

// PATCH /api/team/[id]/role — owner only. Stage O5: make someone a coach,
// a co-owner, or back to athlete. DB-enforced on top of this route:
// enforce_member_role_update_guard (only owners change roles) and
// members_last_owner_guard (a gym always keeps an active owner — surfaced
// as a 409 via mapMemberGuardError).
//
// O4/O5 security gate (B1): any outstanding unclaimed invite for the row is
// expired *before* the role changes. Otherwise a link a coach minted while
// the row was an athlete would stay live after the owner promotes it, and
// that coach could claim a coach/owner login. The owner re-invites after.
export const PATCH = withAuth(
  async (_request: NextRequest, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No member id provided.");
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Personal workspaces don't have a team.");
    }

    const supabase = createClient();
    const { data: member } = await supabase
      .from("members")
      .select("id, role, active, first_name, last_name, user_id")
      .eq("id", id)
      .single();

    if (!member) {
      return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your academy.");
    }
    if (!member.active) {
      return apiError(409, "MEMBER_INACTIVE", "Reactivate this person before changing their role.");
    }
    if (member.role === input.role) {
      return NextResponse.json({ success: true });
    }

    if (!member.user_id) {
      const { error: expireError } = await createServiceRoleClient()
        .from("invites")
        .update({ expires_at: new Date().toISOString() })
        .eq("member_id", id)
        .is("claimed_at", null);
      if (expireError) {
        console.error("[team] failed to expire invites before role change", expireError);
        return apiError(
          500,
          "ROLE_CHANGE_FAILED",
          "Something went wrong — the change wasn't saved.",
        );
      }
    }

    const { data: updated, error } = await supabase
      .from("members")
      .update({ role: input.role })
      .eq("id", id)
      .select("id");

    if (error || !updated || updated.length === 0) {
      const mapped = mapMemberGuardError(error);
      if (mapped) return mapped;
      console.error("[team] role change failed", error);
      return apiError(500, "ROLE_CHANGE_FAILED", "Something went wrong — the change wasn't saved.");
    }

    // A privilege change must never go unrecorded: if the audit row can't
    // be written, put the role back and report failure.
    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "team.role_changed",
      entityType: "members",
      entityId: id,
      beforeState: { role: member.role },
      afterState: { role: input.role },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      const { error: revertError } = await supabase
        .from("members")
        .update({ role: member.role })
        .eq("id", id);
      if (revertError) console.error("[team] failed to revert unaudited role change", revertError);
      return apiError(500, "ROLE_CHANGE_FAILED", "Something went wrong — the change wasn't saved.");
    }

    return NextResponse.json({ success: true, needsInvite: !member.user_id });
  },
  { requiredRole: "gym_owner", schema: changeRoleSchema },
);
