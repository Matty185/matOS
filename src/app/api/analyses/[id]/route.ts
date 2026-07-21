import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { updateAnalysisSchema } from "@/lib/validation/analysis";
import type { Database } from "@/types/database";

type AnalysisUpdate = Database["public"]["Tables"]["analyses"]["Update"];

// PATCH /api/analyses/[id] — self or staff, enforced entirely by RLS
// (analyses_update_self / analyses_update_staff), not a role check here.
// Edits match metadata (duration/opponent/result) and drives the manual
// "Finish" transition (mark_complete -> status: complete). Works the same
// whether the underlying analysis was AI-stub-generated or manually
// created — corrections go through this one endpoint either way.
export const PATCH = withAuth(
  async (_request, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No analysis id provided.");
    const supabase = createClient();

    const update: AnalysisUpdate = {};
    if (input.title !== undefined) update.title = input.title;
    if (input.duration_seconds !== undefined) update.duration_seconds = input.duration_seconds;
    if (input.opponent_name !== undefined) update.opponent_name = input.opponent_name;
    if (input.result !== undefined) update.result = input.result;
    if (input.result_method !== undefined) update.result_method = input.result_method;
    if (input.mark_complete) {
      update.status = "complete";
      update.analysed_at = new Date().toISOString();
    }

    if (Object.keys(update).length === 0) {
      return apiError(400, "NO_CHANGES", "No fields to update were provided.");
    }

    const { data: updated, error: updateError } = await supabase
      .from("analyses")
      .update(update)
      .eq("id", id)
      .select("id, member_id, title, status")
      .single();

    if (updateError || !updated) {
      return apiError(404, "ANALYSIS_NOT_FOUND", "No analysis found with that id.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: input.mark_complete ? "analysis.completed" : "analysis.updated",
      entityType: "analyses",
      entityId: id,
      afterState: { ...update },
      initiatedBy: updated.member_id === context.memberId ? "self_service" : "coach_manual",
    });

    return NextResponse.json({ success: true, analysis: updated });
  },
  { schema: updateAnalysisSchema },
);
