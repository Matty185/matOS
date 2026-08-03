import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { mapBreakdownTagError } from "@/lib/api/breakdown-tag-errors";
import { updateBreakdownPositionSchema, type Database } from "@matos/shared";

type PositionUpdate = Database["public"]["Tables"]["breakdown_positions"]["Update"];

// PATCH /api/breakdowns/[id]/positions/[positionRowId] — edit an
// already-tagged interval's role/timestamps (the timeline/tag-list's edit
// action). Author-only, via RLS.
export const PATCH = withAuth(
  async (_request, context, input, params) => {
    const positionRowId = params.positionRowId;
    const breakdownId = params.id;
    if (!positionRowId || !breakdownId) {
      return apiError(400, "MISSING_ID", "No position or breakdown id provided.");
    }
    const supabase = createClient();

    const update: PositionUpdate = {};
    if (input.role !== undefined) update.role = input.role;
    if (input.start_ts !== undefined) update.start_ts = input.start_ts;
    if (input.end_ts !== undefined) update.end_ts = input.end_ts;

    if (Object.keys(update).length === 0) {
      return apiError(400, "NO_CHANGES", "No fields to update were provided.");
    }

    const { data: updated, error: updateError } = await supabase
      .from("breakdown_positions")
      .update(update)
      .eq("id", positionRowId)
      .eq("breakdown_id", breakdownId)
      .select("id")
      .single();

    if (updateError || !updated) {
      // A CHECK/trigger rejection (e.g. end_ts before start_ts, an invalid
      // role) is a real, live-reachable outcome here — tag-edit-dialog
      // gives free-text start/end second inputs with no cross-field
      // validation of its own. Found in the Stage A3 review gate
      // (database-reviewer): without this check, that case fell through
      // to a generic 404 "not found," which is actively misleading since
      // the row does exist and was rejected for an unrelated reason.
      const mapped = updateError ? mapBreakdownTagError(updateError) : null;
      if (mapped) return apiError(mapped.status, mapped.code, mapped.message);
      return apiError(404, "POSITION_NOT_FOUND", "No position tag found with that id.");
    }

    return NextResponse.json({ success: true });
  },
  { schema: updateBreakdownPositionSchema },
);

// DELETE /api/breakdowns/[id]/positions/[positionRowId] — a deliberate,
// narrow exception to CLAUDE.md Rule 6 ("deletes are mostly disabled"),
// same reasoning as breakdown deletion cascades (Non-Negotiable #8): this
// is the author's own draft-like tagging artifact, not a business record.
export const DELETE = withAuth(async (_request, context, _input, params) => {
  const positionRowId = params.positionRowId;
  const breakdownId = params.id;
  if (!positionRowId || !breakdownId) {
    return apiError(400, "MISSING_ID", "No position or breakdown id provided.");
  }
  const supabase = createClient();

  const { data: deleted, error: deleteError } = await supabase
    .from("breakdown_positions")
    .delete()
    .eq("id", positionRowId)
    .eq("breakdown_id", breakdownId)
    .select("id")
    .single();

  if (deleteError || !deleted) {
    return apiError(404, "POSITION_NOT_FOUND", "No position tag found with that id.");
  }

  return NextResponse.json({ success: true });
});
