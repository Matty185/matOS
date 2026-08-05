import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { mapBreakdownTagError } from "@/lib/api/breakdown-tag-errors";
import { createBreakdownEventSchema } from "@matos/shared";

// POST /api/breakdowns/[id]/events — logs one timestamped event (the
// tap-event -> auto-pause -> confirm flow's final "confirm" step per plan
// §6). modifier/outcome are validated server-side against the referenced
// event_type by the DB's own validate_breakdown_event trigger — this route
// doesn't duplicate that logic, just passes the values through and maps
// the trigger's rejection to a clean error via the shared
// mapBreakdownTagError helper. Author-only, via RLS
// (breakdown_events_all_author).
export const POST = withAuth(
  async (_request, context, input, params) => {
    const breakdownId = params.id;
    if (!breakdownId) return apiError(400, "MISSING_ID", "No breakdown id provided.");
    const supabase = createClient();

    // Idempotency key (Stage M3 gate fix): unlike positions, event
    // creates have no server-side RPC to hold this check, so it's done
    // here — before insert, not relied on solely via the unique index —
    // so a retried create (mobile's sync engine resending a POST whose
    // response was lost) returns the original row instead of a duplicate.
    // breakdown_events_client_id_unique still catches the residual
    // check-then-insert race (mapped to a clean 409 by mapBreakdownTagError).
    if (input.client_id) {
      const { data: existing } = await supabase
        .from("breakdown_events")
        .select("id, event_type_id, modifier, outcome, ts")
        .eq("breakdown_id", breakdownId)
        .eq("client_id", input.client_id)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ success: true, event: existing }, { status: 200 });
      }
    }

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
        client_id: input.client_id ?? null,
        source: "manual",
      })
      .select("id, event_type_id, modifier, outcome, ts")
      .single();

    if (insertError || !created) {
      const mapped = insertError ? mapBreakdownTagError(insertError) : null;
      if (mapped) return apiError(mapped.status, mapped.code, mapped.message);
      console.error("[breakdown events] insert failed", insertError);
      return apiError(500, "CREATE_FAILED", "Something went wrong — the event wasn't saved.");
    }

    return NextResponse.json({ success: true, event: created }, { status: 201 });
  },
  { schema: createBreakdownEventSchema },
);
