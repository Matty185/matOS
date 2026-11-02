import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLogStrict } from "@/lib/audit/log";

// DELETE /api/announcements/[id] — coach/owner. Flow audit 7.1: take an
// announcement down (there is no edit: delete and post again). RLS
// (delete_staff) scopes it to the caller's gym. Audit-first, fail-closed.
export const DELETE = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No announcement id provided.");
    const supabase = createClient();

    const { data: row } = await supabase
      .from("announcements")
      .select("id, title, body, show_until")
      .eq("id", id)
      .maybeSingle();
    if (!row) return apiError(404, "NOT_FOUND", "That announcement wasn't found.");

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "announcement.deleted",
      entityType: "announcements",
      entityId: row.id,
      beforeState: { title: row.title, body: row.body, show_until: row.show_until },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      return apiError(500, "DELETE_FAILED", "Something went wrong — nothing was changed.");
    }

    const { error } = await supabase.from("announcements").delete().eq("id", row.id);
    if (error) {
      console.error("[announcements] delete failed after audit", error.code);
      return apiError(500, "DELETE_FAILED", "Something went wrong — nothing was changed.");
    }
    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach" },
);
