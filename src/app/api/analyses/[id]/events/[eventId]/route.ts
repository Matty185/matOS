import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { updateAnalysisEventSchema } from "@/lib/validation/analysis";
import type { Database } from "@/types/database";

type EventUpdate = Database["public"]["Tables"]["analysis_events"]["Update"];

// PATCH /api/analyses/[id]/events/[eventId] — correct a mistake (wrong
// type, timestamp, notes) on an already-logged event. Self or staff, via
// RLS.
export const PATCH = withAuth(
  async (_request, context, input, params) => {
    const analysisId = params.id;
    const eventId = params.eventId;
    if (!analysisId || !eventId)
      return apiError(400, "MISSING_ID", "Missing analysis or event id.");
    const supabase = createClient();

    const update: EventUpdate = {};
    if (input.event_type !== undefined) update.event_type = input.event_type;
    if (input.timestamp_seconds !== undefined) update.timestamp_seconds = input.timestamp_seconds;
    if (input.duration_seconds !== undefined) update.duration_seconds = input.duration_seconds;
    if (input.notes !== undefined) update.notes = input.notes;

    if (Object.keys(update).length === 0) {
      return apiError(400, "NO_CHANGES", "No fields to update were provided.");
    }

    const { data: updated, error: updateError } = await supabase
      .from("analysis_events")
      .update(update)
      .eq("id", eventId)
      .eq("analysis_id", analysisId)
      .select("id, member_id")
      .single();

    if (updateError || !updated) {
      return apiError(404, "EVENT_NOT_FOUND", "No event found with that id.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "analysis_event.updated",
      entityType: "analysis_events",
      entityId: eventId,
      afterState: { ...update },
      initiatedBy: updated.member_id === context.memberId ? "self_service" : "coach_manual",
    });

    return NextResponse.json({ success: true });
  },
  { schema: updateAnalysisEventSchema },
);

// DELETE /api/analyses/[id]/events/[eventId] — a deliberate, narrow
// exception to CLAUDE.md Rule 6 ("deletes are mostly disabled"): this is
// draft-like content a user is actively correcting while timestamping a
// video (a misclick, wrong event type picked), not a business record like
// a payment or audit entry. See the migration's own comment
// (analysis_events_all_staff / analysis_events_all_self, both `for all`)
// for the RLS side of this.
export const DELETE = withAuth(async (_request, context, _input, params) => {
  const analysisId = params.id;
  const eventId = params.eventId;
  if (!analysisId || !eventId) return apiError(400, "MISSING_ID", "Missing analysis or event id.");
  const supabase = createClient();

  const { data: deleted, error: deleteError } = await supabase
    .from("analysis_events")
    .delete()
    .eq("id", eventId)
    .eq("analysis_id", analysisId)
    .select("id, member_id")
    .single();

  if (deleteError || !deleted) {
    return apiError(404, "EVENT_NOT_FOUND", "No event found with that id.");
  }

  await writeAuditLog({
    gymId: context.gymId,
    actorId: context.userId,
    action: "analysis_event.deleted",
    entityType: "analysis_events",
    entityId: eventId,
    initiatedBy: deleted.member_id === context.memberId ? "self_service" : "coach_manual",
  });

  return NextResponse.json({ success: true });
});
