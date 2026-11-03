import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { editClassSchema } from "@matos/shared";

export const PATCH = withAuth(
  async (_request: NextRequest, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No class id provided.");
    const supabase = createClient();

    const { data: before } = await supabase.from("classes").select("*").eq("id", id).single();
    if (!before) {
      return apiError(404, "CLASS_NOT_FOUND", "No class found with that id in your gym.");
    }

    const { error: updateError } = await supabase
      .from("classes")
      .update({
        name: input.name,
        class_type: input.class_type,
        day_of_week: input.day_of_week,
        start_time: input.start_time,
        duration_minutes: input.duration_minutes,
        max_capacity: input.max_capacity ?? null,
        active: input.active,
        // Flow audit 3.3/3.4: left as stored when the caller omits them.
        ...(input.coach_member_id !== undefined ? { coach_member_id: input.coach_member_id } : {}),
        ...(input.program !== undefined ? { program: input.program } : {}),
      })
      .eq("id", id);

    if (updateError?.code === "22023") {
      return apiError(400, "INVALID_COACH", "Pick an active coach or owner from your gym.");
    }
    if (updateError) {
      return apiError(
        500,
        "CLASS_UPDATE_FAILED",
        "Something went wrong — the change wasn't saved.",
      );
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "class.updated",
      entityType: "classes",
      entityId: id,
      beforeState: before,
      afterState: { ...input },
      initiatedBy: "coach_manual",
    });

    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach", schema: editClassSchema },
);

// DELETE /api/classes/[id] — coach/owner only. Attempts a hard delete;
// Stage 1's FK (attendance.class_id references classes ON DELETE RESTRICT)
// makes this fail once any attendance history exists, by design — "deleting"
// a class with history should mean deactivating it (the edit form's active
// toggle), not losing attendance records. Postgres error 23503 is the
// foreign-key-violation code; surfaced as a specific, actionable message
// rather than a generic 500.
export const DELETE = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No class id provided.");
    const supabase = createClient();

    const { data: existing } = await supabase.from("classes").select("name").eq("id", id).single();
    if (!existing) {
      return apiError(404, "CLASS_NOT_FOUND", "No class found with that id in your gym.");
    }

    const { error: deleteError } = await supabase.from("classes").delete().eq("id", id);

    if (deleteError) {
      if (deleteError.code === "23503") {
        return apiError(
          409,
          "CLASS_HAS_ATTENDANCE",
          "This class has attendance history and can't be deleted — deactivate it instead.",
        );
      }
      return apiError(
        500,
        "CLASS_DELETE_FAILED",
        "Something went wrong — the class wasn't deleted.",
      );
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "class.deleted",
      entityType: "classes",
      entityId: id,
      beforeState: { name: existing.name },
      initiatedBy: "coach_manual",
    });

    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach" },
);
