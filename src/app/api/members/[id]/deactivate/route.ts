import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { deactivateMemberSchema } from "@/lib/validation/member";

// POST /api/members/[id]/deactivate — coach/owner only. Sets active=false;
// members are deactivated, never hard-deleted, per CLAUDE.md Rule 6. The
// `confirm: true` body requirement backs the UI's own confirmation dialog
// with a real server-side check — the typed "yes"/"confirm" requirement in
// CLAUDE.md is specifically for the agent's deactivate_member tool call
// (Agentic Interface Rules), not this direct dashboard action, which uses a
// standard confirm-dialog pattern instead.
export const POST = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No member id provided.");
    const supabase = createClient();

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("active, first_name, last_name")
      .eq("id", id)
      .single();

    if (memberError || !member) {
      return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your gym.");
    }

    if (!member.active) {
      return apiError(409, "ALREADY_INACTIVE", "This member is already deactivated.");
    }

    // .eq("active", true) makes this a conditional (atomic) update rather
    // than the earlier read-then-write — found in Stage 4 security review:
    // two concurrent deactivate requests could otherwise both pass the
    // check above and both "succeed," producing two permanent audit_log
    // entries for one logical event. Zero affected rows here means someone
    // else's concurrent request already won; treat that the same as the
    // already-inactive case rather than as a server error.
    const { data: updated, error: updateError } = await supabase
      .from("members")
      .update({ active: false })
      .eq("id", id)
      .eq("active", true)
      .select("id");

    if (updateError) {
      return apiError(500, "DEACTIVATE_FAILED", "Something went wrong — the change wasn't saved.");
    }

    if (!updated || updated.length === 0) {
      return apiError(409, "ALREADY_INACTIVE", "This member is already deactivated.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.deactivated",
      entityType: "members",
      entityId: id,
      beforeState: { active: true },
      afterState: { active: false },
      initiatedBy: "coach_manual",
    });

    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach", schema: deactivateMemberSchema },
);
