import { NextResponse, type NextRequest } from "next/server";
import { memberPhotoPathSchema } from "@matos/shared";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";

// Flow audit 2.6: a member's photo. The browser uploads the (re-encoded)
// image straight to the private member-photos bucket — storage RLS limits
// staff to their own gym's folder — then calls PUT here to point the member
// at it. Both run under the coach's own session.

async function loadMember(supabase: ReturnType<typeof createClient>, id: string, gymId: string) {
  const { data } = await supabase
    .from("members")
    .select("id, photo_url")
    .eq("id", id)
    .eq("gym_id", gymId)
    .maybeSingle();
  return data;
}

// PUT /api/members/[id]/photo — coach/owner. Body: { path }.
export const PUT = withAuth(
  async (_request: NextRequest, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No member id provided.");
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Personal workspaces don't have member photos.");
    }
    if (!input.path.startsWith(`${context.gymId}/${id}/`)) {
      return apiError(400, "INVALID_PATH", "That photo doesn't belong to this member.");
    }
    const supabase = createClient();
    const member = await loadMember(supabase, id, context.gymId);
    if (!member)
      return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your gym.");

    // The file must really be there (uploaded under this session's RLS).
    const folder = `${context.gymId}/${id}`;
    const fileName = input.path.slice(folder.length + 1);
    const { data: listed } = await supabase.storage
      .from("member-photos")
      .list(folder, { search: fileName, limit: 1 });
    if (!listed?.some((o) => o.name === fileName)) {
      return apiError(400, "PHOTO_NOT_UPLOADED", "The photo didn't upload. Try again.");
    }

    const { error } = await supabase.from("members").update({ photo_url: input.path }).eq("id", id);
    if (error) {
      console.error("[photo] update failed", error);
      return apiError(500, "PHOTO_FAILED", "Something went wrong — the photo wasn't saved.");
    }

    // Replace, don't accumulate: remove the previous file (best effort).
    if (member.photo_url && member.photo_url !== input.path) {
      await supabase.storage.from("member-photos").remove([member.photo_url]);
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.photo_updated",
      entityType: "members",
      entityId: id,
      initiatedBy: "coach_manual",
    });
    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach", schema: memberPhotoPathSchema },
);

// DELETE /api/members/[id]/photo — coach/owner. Removes the photo.
export const DELETE = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No member id provided.");
    const supabase = createClient();
    const member = await loadMember(supabase, id, context.gymId);
    if (!member)
      return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your gym.");
    if (!member.photo_url) return NextResponse.json({ success: true });

    const { error } = await supabase.from("members").update({ photo_url: null }).eq("id", id);
    if (error) {
      console.error("[photo] clear failed", error);
      return apiError(500, "PHOTO_FAILED", "Something went wrong — the photo wasn't removed.");
    }
    const { error: removeError } = await supabase.storage
      .from("member-photos")
      .remove([member.photo_url]);
    if (removeError) console.error("[photo] file removal failed", removeError);

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.photo_removed",
      entityType: "members",
      entityId: id,
      initiatedBy: "coach_manual",
    });
    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach" },
);
