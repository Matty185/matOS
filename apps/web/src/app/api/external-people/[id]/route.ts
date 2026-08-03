import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { updateExternalPersonSchema } from "@matos/shared";

export const PATCH = withAuth(
  async (_request, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No person id provided.");
    const supabase = createClient();

    const update: { display_name?: string; notes?: string | null } = {};
    if (input.display_name !== undefined) update.display_name = input.display_name;
    if (input.notes !== undefined) update.notes = input.notes;

    if (Object.keys(update).length === 0) {
      return apiError(400, "NO_CHANGES", "No fields to update were provided.");
    }

    const { data: updated, error: updateError } = await supabase
      .from("external_people")
      .update(update)
      .eq("id", id)
      .select("id")
      .single();

    if (updateError || !updated) {
      return apiError(404, "PERSON_NOT_FOUND", "No person found with that id.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "external_person.updated",
      entityType: "external_people",
      entityId: id,
      afterState: { ...update },
      initiatedBy: context.role === "athlete" ? "self_service" : "coach_manual",
    });

    return NextResponse.json({ success: true });
  },
  { schema: updateExternalPersonSchema },
);

// DELETE /api/external-people/[id] — author (created_by) or staff, per RLS.
// breakdowns.external_person_id is ON DELETE RESTRICT, so this fails with
// Postgres 23503 once any breakdown references this person — deleting a
// person with logged matches should mean editing their name, not silently
// orphaning breakdown history, same reasoning as classes' attendance-history
// guard.
export const DELETE = withAuth(async (_request, context, _input, params) => {
  const id = params.id;
  if (!id) return apiError(400, "MISSING_ID", "No person id provided.");
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("external_people")
    .select("display_name")
    .eq("id", id)
    .single();
  if (!existing) {
    return apiError(404, "PERSON_NOT_FOUND", "No person found with that id.");
  }

  const { error: deleteError } = await supabase.from("external_people").delete().eq("id", id);

  if (deleteError) {
    if (deleteError.code === "23503") {
      return apiError(
        409,
        "PERSON_HAS_BREAKDOWNS",
        "This person has logged matches and can't be deleted.",
      );
    }
    return apiError(500, "DELETE_FAILED", "Something went wrong — the person wasn't deleted.");
  }

  await writeAuditLog({
    gymId: context.gymId,
    actorId: context.userId,
    action: "external_person.deleted",
    entityType: "external_people",
    entityId: id,
    beforeState: { display_name: existing.display_name },
    initiatedBy: context.role === "athlete" ? "self_service" : "coach_manual",
  });

  return NextResponse.json({ success: true });
});
