import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { updateBreakdownSchema, type Database } from "@matos/shared";

type BreakdownUpdate = Database["public"]["Tables"]["breakdowns"]["Update"];

// PATCH /api/breakdowns/[id] — metadata only (name/match_date/gi/result/
// method), never focus (member_id/external_person_id) — breakdowns are
// standalone artifacts per Non-Negotiable #5, and changing focus after
// creation would also fight the gym_id-derivation trigger's intent.
// Author-only, enforced by RLS (breakdowns_all_own), not a role check
// here.
export const PATCH = withAuth(
  async (_request, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No breakdown id provided.");
    const supabase = createClient();

    const update: BreakdownUpdate = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.match_date !== undefined) update.match_date = input.match_date;
    if (input.gi !== undefined) update.gi = input.gi;
    if (input.result !== undefined) update.result = input.result;
    if (input.method !== undefined) update.method = input.method;
    if (input.video_filename !== undefined) update.video_filename = input.video_filename;
    if (input.video_duration_seconds !== undefined) {
      update.video_duration_seconds = input.video_duration_seconds;
    }
    if (input.duration_seconds !== undefined) update.duration_seconds = input.duration_seconds;
    if (input.status !== undefined) update.status = input.status;
    if (input.visibility !== undefined) update.visibility = input.visibility;

    if (Object.keys(update).length === 0) {
      return apiError(400, "NO_CHANGES", "No fields to update were provided.");
    }

    const { data: updated, error: updateError } = await supabase
      .from("breakdowns")
      .update(update)
      .eq("id", id)
      .select("id, author_id")
      .single();

    if (updateError || !updated) {
      return apiError(404, "BREAKDOWN_NOT_FOUND", "No breakdown found with that id.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "breakdown.updated",
      entityType: "breakdowns",
      entityId: id,
      afterState: { ...update },
      initiatedBy: updated.author_id === context.userId ? "self_service" : "coach_manual",
    });

    return NextResponse.json({ success: true });
  },
  { schema: updateBreakdownSchema },
);

// DELETE /api/breakdowns/[id] — author-only, enforced by RLS
// (breakdowns_all_own), not a role check here. Non-Negotiable #8: "deletion
// cascades its positions/events (allowed) — unlike member records," a
// deliberate exception to CLAUDE.md Rule 6's "deletes are mostly disabled"
// since this is the author's own draft-like tagging artifact. No 23503-style
// guard needed the way external-people's DELETE has one — breakdown_positions/
// breakdown_events are ON DELETE CASCADE, not RESTRICT, so this always
// succeeds once RLS allows it at all. Flagged as a missing gap at Stage A9's
// full-pass gate (both database-reviewer and code-reviewer independently) —
// the DB/RLS support for this existed since Stage A1, nothing ever called it.
export const DELETE = withAuth(async (_request, context, _input, params) => {
  const id = params.id;
  if (!id) return apiError(400, "MISSING_ID", "No breakdown id provided.");
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("breakdowns")
    .select("name, author_id")
    .eq("id", id)
    .single();
  if (!existing) {
    return apiError(404, "BREAKDOWN_NOT_FOUND", "No breakdown found with that id.");
  }

  const { error: deleteError } = await supabase.from("breakdowns").delete().eq("id", id);

  if (deleteError) {
    return apiError(500, "DELETE_FAILED", "Something went wrong — the breakdown wasn't deleted.");
  }

  await writeAuditLog({
    gymId: context.gymId,
    actorId: context.userId,
    action: "breakdown.deleted",
    entityType: "breakdowns",
    entityId: id,
    beforeState: { name: existing.name },
    initiatedBy: existing.author_id === context.userId ? "self_service" : "coach_manual",
  });

  return NextResponse.json({ success: true });
});
