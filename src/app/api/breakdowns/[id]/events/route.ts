import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createBreakdownEventSchema } from "@/lib/validation/breakdown-event";

// POST /api/breakdowns/[id]/events — logs one timestamped event (the
// tap-event -> auto-pause -> confirm flow's final "confirm" step per plan
// §6). modifier/outcome are validated server-side against the referenced
// event_type by the DB's own validate_breakdown_event trigger — this route
// doesn't duplicate that logic, just passes the values through and maps
// the trigger's rejection to a clean error. Author-only, via RLS
// (breakdown_events_all_author).
export const POST = withAuth(
  async (_request, context, input, params) => {
    const breakdownId = params.id;
    if (!breakdownId) return apiError(400, "MISSING_ID", "No breakdown id provided.");
    const supabase = createClient();

    const { data: created, error: insertError } = await supabase
      .from("breakdown_events")
      .insert({
        breakdown_id: breakdownId,
        // gym_id is trigger-derived (derive_gym_id_from_breakdown) —
        // required here only because the column has no default.
        gym_id: context.gymId,
        event_type_id: input.event_type_id,
        modifier: input.modifier ?? null,
        outcome: input.outcome ?? null,
        ts: input.ts,
        source: "manual",
      })
      .select("id, event_type_id, modifier, outcome, ts")
      .single();

    if (insertError || !created) {
      if (insertError?.code === "42501") {
        return apiError(403, "FORBIDDEN", "You can't log events on this breakdown.");
      }
      if (
        insertError?.message?.includes("is required for event type") ||
        insertError?.message?.includes("is not valid for event type") ||
        insertError?.message?.includes("has no valid")
      ) {
        return apiError(400, "INVALID_EVENT_DATA", insertError.message);
      }
      console.error("[breakdown events] insert failed", insertError);
      return apiError(500, "CREATE_FAILED", "Something went wrong — the event wasn't saved.");
    }

    return NextResponse.json({ success: true, event: created }, { status: 201 });
  },
  { schema: createBreakdownEventSchema },
);
