import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { updateGymSchema } from "@matos/shared";

// PATCH /api/gym — owner only (plan §7 "Gym settings (owner)"). Stage O5.
// Always the caller's current gym (context.gymId); RLS gyms_update_owner
// and the gyms_owner_column_guard trigger are the real boundary — this
// route only ever writes the four presentation/config columns.
export const PATCH = withAuth(
  async (_request, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Personal workspaces don't have gym settings.");
    }

    const supabase = createClient();
    const { data: before } = await supabase
      .from("gyms")
      .select("name, address, contact_email, timezone")
      .eq("id", context.gymId)
      .single();

    const after = {
      name: input.name,
      address: input.address || null,
      contact_email: input.contact_email || null,
      timezone: input.timezone,
    };

    const { data: updated, error } = await supabase
      .from("gyms")
      .update(after)
      .eq("id", context.gymId)
      .select("id");

    if (error || !updated || updated.length === 0) {
      if (error?.code === "22023") {
        return apiError(400, "INVALID_TIMEZONE", "Choose a time zone from the list.");
      }
      console.error("[gym] update failed", error);
      return apiError(500, "GYM_UPDATE_FAILED", "Something went wrong — the change wasn't saved.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "gym.updated",
      entityType: "gyms",
      entityId: context.gymId,
      beforeState: before ?? null,
      afterState: after,
      initiatedBy: "coach_manual",
    });

    return NextResponse.json({ success: true });
  },
  { requiredRole: "gym_owner", schema: updateGymSchema },
);
