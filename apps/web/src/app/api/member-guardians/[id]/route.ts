import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLogStrict } from "@/lib/audit/log";

// DELETE /api/member-guardians/[id] — coach/owner. Flow audit 8.2: unlink a
// parent from a child (the parent's member row stays; deactivate it
// separately if they no longer need an account). RLS scopes it to the
// caller's gym. Audit-first, fail-closed.
export const DELETE = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No link id provided.");
    const supabase = createClient();
    const { data: link } = await supabase
      .from("member_guardians")
      .select("id, guardian_member_id, child_member_id")
      .eq("id", id)
      .maybeSingle();
    if (!link) return apiError(404, "NOT_FOUND", "That parent link wasn't found.");

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.guardian_unlinked",
      entityType: "members",
      entityId: link.child_member_id,
      beforeState: {
        child_member_id: link.child_member_id,
        guardian_member_id: link.guardian_member_id,
      },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      return apiError(500, "UNLINK_FAILED", "Something went wrong — nothing was changed.");
    }
    const { data: deleted, error } = await supabase
      .from("member_guardians")
      .delete()
      .eq("id", id)
      .select("id");
    if (error || !deleted || deleted.length === 0) {
      console.error("[guardians] unlink failed after audit", error?.code);
      return apiError(500, "UNLINK_FAILED", "Something went wrong — nothing was changed.");
    }
    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach" },
);
