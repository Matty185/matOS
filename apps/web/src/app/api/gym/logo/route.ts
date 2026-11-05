import { NextResponse } from "next/server";
import { gymLogoPathSchema } from "@matos/shared";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";

// Flow audit 10.5: the gym logo. The owner's browser uploads it to the
// private gym-logos bucket (storage RLS: owner, own gym's folder), then PUT
// here points the gym at it.

// PUT /api/gym/logo — owner only. Body: { path }.
export const PUT = withAuth(
  async (_request, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Personal workspaces don't have a logo.");
    }
    if (!input.path.startsWith(`${context.gymId}/`)) {
      return apiError(400, "INVALID_PATH", "That logo doesn't belong to your academy.");
    }
    const supabase = createClient();
    const fileName = input.path.slice(context.gymId.length + 1);
    const { data: listed } = await supabase.storage
      .from("gym-logos")
      .list(context.gymId, { search: fileName, limit: 1 });
    if (!listed?.some((o) => o.name === fileName)) {
      return apiError(400, "LOGO_NOT_UPLOADED", "The logo didn't upload. Try again.");
    }

    const { data: before } = await supabase
      .from("gyms")
      .select("logo_url")
      .eq("id", context.gymId)
      .single();
    const { data: rows, error } = await supabase
      .from("gyms")
      .update({ logo_url: input.path })
      .eq("id", context.gymId)
      .select("id");
    if (error || !rows || rows.length === 0) {
      console.error("[logo] update failed", error);
      return apiError(500, "LOGO_FAILED", "Something went wrong — the logo wasn't saved.");
    }
    if (before?.logo_url && before.logo_url !== input.path) {
      await supabase.storage.from("gym-logos").remove([before.logo_url]);
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "gym.logo_updated",
      entityType: "gyms",
      entityId: context.gymId,
      initiatedBy: "coach_manual",
    });
    return NextResponse.json({ success: true });
  },
  { requiredRole: "gym_owner", schema: gymLogoPathSchema },
);

// DELETE /api/gym/logo — owner only.
export const DELETE = withAuth(
  async (_request, context) => {
    const supabase = createClient();
    const { data: before } = await supabase
      .from("gyms")
      .select("logo_url")
      .eq("id", context.gymId)
      .single();
    if (!before?.logo_url) return NextResponse.json({ success: true });
    const { error } = await supabase
      .from("gyms")
      .update({ logo_url: null })
      .eq("id", context.gymId);
    if (error) {
      console.error("[logo] clear failed", error);
      return apiError(500, "LOGO_FAILED", "Something went wrong — the logo wasn't removed.");
    }
    await supabase.storage.from("gym-logos").remove([before.logo_url]);
    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "gym.logo_removed",
      entityType: "gyms",
      entityId: context.gymId,
      initiatedBy: "coach_manual",
    });
    return NextResponse.json({ success: true });
  },
  { requiredRole: "gym_owner" },
);
