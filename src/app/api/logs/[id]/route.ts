import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { athleteLogSchema } from "@/lib/validation/account";

// PATCH /api/logs/[id] — self only. The `.eq("member_id", context.memberId)`
// below is a defensive, explicit ownership check on top of RLS (which
// already scopes athlete_logs_all_self to member_id = my_member_id()) — this
// gets a clean 404 for someone else's log id instead of a silent zero-row
// update.
export const PATCH = withAuth(
  async (_request, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No log id provided.");
    const supabase = createClient();

    const { data: updated, error: updateError } = await supabase
      .from("athlete_logs")
      .update({
        entry_date: input.entry_date,
        working_on: input.working_on || null,
        struggling_with: input.struggling_with || null,
        notes: input.notes || null,
        visible_to_coach: input.visible_to_coach,
      })
      .eq("id", id)
      .eq("member_id", context.memberId)
      .select("id")
      .single();

    if (updateError || !updated) {
      return apiError(404, "LOG_NOT_FOUND", "No log entry found with that id.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "athlete_log.updated",
      entityType: "athlete_logs",
      entityId: id,
      initiatedBy: "self_service",
    });

    return NextResponse.json({ success: true });
  },
  { schema: athleteLogSchema },
);

// DELETE /api/logs/[id] — self only. athlete_logs is one of the few tables
// where RLS grants real DELETE to its owner (athlete_logs_all_self is `for
// all`, per Stage 1's own comment: "Athlete: full CRUD on own rows") — a
// personal journal entry, unlike member/attendance/payment records, which
// CLAUDE.md Rule 6 keeps append-only/soft-delete.
export const DELETE = withAuth(async (_request, context, _input, params) => {
  const id = params.id;
  if (!id) return apiError(400, "MISSING_ID", "No log id provided.");
  const supabase = createClient();

  const { data: deleted, error: deleteError } = await supabase
    .from("athlete_logs")
    .delete()
    .eq("id", id)
    .eq("member_id", context.memberId)
    .select("id")
    .single();

  if (deleteError || !deleted) {
    return apiError(404, "LOG_NOT_FOUND", "No log entry found with that id.");
  }

  await writeAuditLog({
    gymId: context.gymId,
    actorId: context.userId,
    action: "athlete_log.deleted",
    entityType: "athlete_logs",
    entityId: id,
    initiatedBy: "self_service",
  });

  return NextResponse.json({ success: true });
});
