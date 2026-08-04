import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";

// POST /api/share-links/[id]/revoke — author-only (RLS: share_links_all_own,
// created_by-scoped). Sets revoked = true rather than deleting the row —
// matches this codebase's general "deletes mostly disabled" posture and
// keeps the row around for the creator's own management list/audit trail.
// Irreversible by design: no "un-revoke" endpoint, since a link a coach
// revoked (e.g. because it was accidentally shared somewhere it shouldn't
// have been) should require creating a fresh one, not silently reviving
// the same token.
export const POST = withAuth(async (_request, context, _input, params) => {
  const id = params.id;
  if (!id) return apiError(400, "MISSING_ID", "No share link id provided.");
  const supabase = createClient();

  const { data: updated, error } = await supabase
    .from("share_links")
    .update({ revoked: true })
    .eq("id", id)
    .select("id")
    .single();

  if (error || !updated) {
    return apiError(404, "SHARE_LINK_NOT_FOUND", "No share link found with that id.");
  }

  await writeAuditLog({
    gymId: context.gymId,
    actorId: context.userId,
    action: "share_link.revoked",
    entityType: "share_links",
    entityId: id,
    initiatedBy: context.role === "athlete" ? "self_service" : "coach_manual",
  });

  return NextResponse.json({ success: true });
});
