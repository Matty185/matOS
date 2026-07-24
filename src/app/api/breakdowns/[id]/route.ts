import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { updateBreakdownSchema } from "@/lib/validation/breakdown";
import type { Database } from "@/types/database";

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
