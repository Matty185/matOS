import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { mapBreakdownTagError } from "@/lib/api/breakdown-tag-errors";
import { createBreakdownPositionSchema } from "@matos/shared";

// POST /api/breakdowns/[id]/positions — tags a position, opening a new
// interval. Per plan §6 ("position selector... sets interval start; next
// position tag closes previous interval") and the DB's own
// breakdown_positions_one_open_interval_idx (a partial unique index on
// breakdown_id WHERE end_ts IS NULL, added in the Stage A1 review fixes),
// at most one interval can be open per breakdown at a time.
//
// Closing the prior interval and inserting the new one happens inside a
// single Postgres function (tag_position, SECURITY INVOKER — runs with
// this caller's own RLS, not elevated) rather than as two separate
// requests. Found in the Stage A3 review gate (security-reviewer +
// database-reviewer, the latter live-reproducing it): two sequential
// client calls meant a failure on the second (insert) left the first
// (close) already committed with no rollback — the just-tapped position
// was silently lost, no compensating undo, generic 500. A function body
// is an implicit transaction, so any exception rolls back both
// statements together.
export const POST = withAuth(
  async (_request, context, input, params) => {
    const breakdownId = params.id;
    if (!breakdownId) return apiError(400, "MISSING_ID", "No breakdown id provided.");
    const supabase = createClient();

    // tag_position returns a single breakdown_positions row (not SETOF),
    // so PostgREST/Supabase JS return it as a plain object already —
    // .single() isn't applicable here the way it is on a table .select().
    // p_role is genuinely nullable at the SQL level (verified live); the
    // generated RPC arg type just doesn't reflect that since the function
    // signature has no `default null` — a codegen quirk, not a real
    // constraint, hence the cast rather than a schema change.
    const { data: created, error } = await supabase.rpc("tag_position", {
      p_breakdown_id: breakdownId,
      p_position_id: input.position_id,
      p_role: (input.role ?? null) as string,
      p_start_ts: input.start_ts,
      // Idempotency key (Stage M3 gate fix) — see tag_position's own
      // migration comment for why a retried create must be a safe no-op.
      ...(input.client_id ? { p_client_id: input.client_id } : {}),
    });

    if (error || !created) {
      const mapped = error ? mapBreakdownTagError(error) : null;
      if (mapped) return apiError(mapped.status, mapped.code, mapped.message);
      console.error("[breakdown positions] tag_position failed", error);
      return apiError(500, "CREATE_FAILED", "Something went wrong — the position wasn't tagged.");
    }

    return NextResponse.json({ success: true, position: created }, { status: 201 });
  },
  { schema: createBreakdownPositionSchema },
);
