import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { createAnalysisEventSchema } from "@/lib/validation/analysis";

// POST /api/analyses/[id]/events — logs one timestamped event against a
// match. Used by the manual video player as the user scrubs and logs, and
// reusable for adding to an AI-stub-generated log. member_id/gym_id are
// never accepted here — analysis_events_derive_ids (trigger) stamps both
// from analysis_id server-side, and RLS (analysis_events_all_self /
// analysis_events_all_staff) is what actually decides whether this caller
// may write against that analysis, same "RLS is the real boundary" posture
// as every other write route in this app.
export const POST = withAuth(
  async (_request, context, input, params) => {
    const analysisId = params.id;
    if (!analysisId) return apiError(400, "MISSING_ID", "No analysis id provided.");
    const supabase = createClient();

    const { data: created, error: insertError } = await supabase
      .from("analysis_events")
      .insert({
        analysis_id: analysisId,
        // member_id/gym_id are NOT NULL with no default, so the insert
        // shape requires *something* here — but analysis_events_derive_ids
        // (BEFORE INSERT trigger) overwrites both from analysis_id before
        // constraints/RLS are checked, same as analyses_derive_gym_id
        // already does for `analyses`. These placeholders are never what
        // actually lands in the row.
        member_id: context.memberId,
        gym_id: context.gymId,
        event_type: input.event_type,
        timestamp_seconds: input.timestamp_seconds,
        duration_seconds: input.duration_seconds ?? null,
        notes: input.notes ?? null,
        created_by: context.userId,
      })
      .select("id, event_type, timestamp_seconds, duration_seconds, notes, member_id")
      .single();

    if (insertError || !created) {
      if (insertError?.message?.includes("row-level security")) {
        return apiError(403, "FORBIDDEN", "You can't log events on that match.");
      }
      if (insertError?.message?.includes("does not reference an existing analysis")) {
        return apiError(404, "ANALYSIS_NOT_FOUND", "No analysis found with that id.");
      }
      console.error("[analysis events] insert failed", insertError);
      return apiError(500, "CREATE_FAILED", "Something went wrong — the event wasn't saved.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "analysis_event.created",
      entityType: "analysis_events",
      entityId: created.id,
      afterState: {
        analysis_id: analysisId,
        event_type: created.event_type,
        timestamp_seconds: created.timestamp_seconds,
      },
      initiatedBy: created.member_id === context.memberId ? "self_service" : "coach_manual",
    });

    return NextResponse.json({ success: true, event: created }, { status: 201 });
  },
  { schema: createAnalysisEventSchema },
);
