import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { mapBreakdownTagError } from "@/lib/api/breakdown-tag-errors";
import { updateBreakdownEventSchema, type Database } from "@matos/shared";

type EventUpdate = Database["public"]["Tables"]["breakdown_events"]["Update"];

// PATCH /api/breakdowns/[id]/events/[eventRowId] — correct a mistake
// (wrong modifier/outcome/timestamp) on an already-logged event.
// Author-only, via RLS.
export const PATCH = withAuth(
  async (_request, context, input, params) => {
    const eventRowId = params.eventRowId;
    const breakdownId = params.id;
    if (!eventRowId || !breakdownId) {
      return apiError(400, "MISSING_ID", "No event or breakdown id provided.");
    }
    const supabase = createClient();

    const update: EventUpdate = {};
    if (input.modifier !== undefined) update.modifier = input.modifier;
    if (input.outcome !== undefined) update.outcome = input.outcome;
    if (input.ts !== undefined) update.ts = input.ts;

    if (Object.keys(update).length === 0) {
      return apiError(400, "NO_CHANGES", "No fields to update were provided.");
    }

    const { data: updated, error: updateError } = await supabase
      .from("breakdown_events")
      .update(update)
      .eq("id", eventRowId)
      .eq("breakdown_id", breakdownId)
      .select("id")
      .single();

    if (updateError || !updated) {
      const mapped = updateError ? mapBreakdownTagError(updateError) : null;
      if (mapped) return apiError(mapped.status, mapped.code, mapped.message);
      return apiError(404, "EVENT_NOT_FOUND", "No event found with that id.");
    }

    return NextResponse.json({ success: true });
  },
  { schema: updateBreakdownEventSchema },
);

// DELETE /api/breakdowns/[id]/events/[eventRowId] — same deliberate Rule 6
// exception as breakdown_positions (draft-like tagging artifact, not a
// business record).
export const DELETE = withAuth(async (_request, context, _input, params) => {
  const eventRowId = params.eventRowId;
  const breakdownId = params.id;
  if (!eventRowId || !breakdownId) {
    return apiError(400, "MISSING_ID", "No event or breakdown id provided.");
  }
  const supabase = createClient();

  const { data: deleted, error: deleteError } = await supabase
    .from("breakdown_events")
    .delete()
    .eq("id", eventRowId)
    .eq("breakdown_id", breakdownId)
    .select("id")
    .single();

  if (deleteError || !deleted) {
    return apiError(404, "EVENT_NOT_FOUND", "No event found with that id.");
  }

  return NextResponse.json({ success: true });
});
