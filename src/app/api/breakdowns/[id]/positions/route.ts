import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createBreakdownPositionSchema } from "@/lib/validation/breakdown-position";

// POST /api/breakdowns/[id]/positions — tags a position, opening a new
// interval. Per plan §6 ("position selector... sets interval start; next
// position tag closes previous interval") and the DB's own
// breakdown_positions_one_open_interval_idx (a partial unique index on
// breakdown_id WHERE end_ts IS NULL, added in the Stage A1 review fixes),
// at most one interval can be open per breakdown at a time — so this
// route closes any currently-open interval (end_ts = the new interval's
// start_ts) before inserting the new one, keeping the client's job to
// "tag a position" a single call rather than two the client has to
// sequence itself. Author-only, enforced by RLS
// (breakdown_positions_all_author), not a role check here.
export const POST = withAuth(
  async (_request, context, input, params) => {
    const breakdownId = params.id;
    if (!breakdownId) return apiError(400, "MISSING_ID", "No breakdown id provided.");
    const supabase = createClient();

    const { error: closeError } = await supabase
      .from("breakdown_positions")
      .update({ end_ts: input.start_ts })
      .eq("breakdown_id", breakdownId)
      .is("end_ts", null);

    if (closeError) {
      console.error("[breakdown positions] failed to close open interval", closeError);
      return apiError(500, "CREATE_FAILED", "Something went wrong — the position wasn't tagged.");
    }

    const { data: created, error: insertError } = await supabase
      .from("breakdown_positions")
      .insert({
        breakdown_id: breakdownId,
        // gym_id is trigger-derived (derive_gym_id_from_breakdown) — always
        // overwritten before constraints/RLS are checked, required here
        // only because the column has no default.
        gym_id: context.gymId,
        position_id: input.position_id,
        role: input.role ?? null,
        start_ts: input.start_ts,
      })
      .select("id, position_id, role, start_ts, end_ts")
      .single();

    if (insertError || !created) {
      if (insertError?.code === "42501") {
        return apiError(403, "FORBIDDEN", "You can't tag positions on this breakdown.");
      }
      console.error("[breakdown positions] insert failed", insertError);
      return apiError(500, "CREATE_FAILED", "Something went wrong — the position wasn't tagged.");
    }

    return NextResponse.json({ success: true, position: created }, { status: 201 });
  },
  { schema: createBreakdownPositionSchema },
);
