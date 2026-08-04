import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { createBreakdownSchema } from "@matos/shared";

// POST /api/breakdowns — any authenticated member, self or staff-on-behalf.
// No requiredRole gate: an athlete authoring their own breakdown (or one
// about an external person they created) and a coach/owner authoring for
// any member both go through this same route. RLS (breakdowns_all_own) is
// the actual enforcement boundary — an athlete who supplies someone else's
// member_id gets rejected there, mapped to 403 below, matching CLAUDE.md
// Rule 2 ("RLS at the database layer is the security boundary").
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();

    const { data: created, error: insertError } = await supabase
      .from("breakdowns")
      .insert({
        // gym_id is trigger-derived (derive_gym_id_from_breakdown_focus)
        // from member_id/external_person_id — this value is always
        // overwritten before constraints/RLS are checked, same pattern as
        // every other trigger-derived gym_id in this schema. Required here
        // only because the column has no default.
        gym_id: context.gymId,
        author_id: context.userId,
        member_id: input.member_id ?? null,
        external_person_id: input.external_person_id ?? null,
        name: input.name,
        match_date: input.match_date,
        gi: input.gi,
        result: input.result ?? null,
        method: input.method ?? null,
        // Stage S2: context-aware default, not the DB column's flat 'gym'
        // default (matos_mobile_plan.md §2.2 — private by default in a
        // personal workspace, gym by default in a real gym). Safe to key
        // off context.gymKind here specifically because RLS already
        // constrains member_id/external_person_id to the caller's own
        // current gym (breakdowns_all_own), so the trigger-derived gym_id
        // this row actually lands in always matches context.gymId/gymKind
        // for every request that reaches this far.
        visibility: input.visibility ?? (context.gymKind === "personal" ? "private" : "gym"),
      })
      .select("id, name, match_date, status")
      .single();

    if (insertError || !created) {
      // 42501 is Postgres's stable insufficient_privilege code (RLS
      // rejection) — matching on it, not the error message text, per this
      // codebase's own convention elsewhere (e.g. 23505 for unique-
      // violation in attendance/mark).
      if (insertError?.code === "42501") {
        return apiError(403, "FORBIDDEN", "You can't create a breakdown for that focus.");
      }
      console.error("[breakdowns] insert failed", insertError);
      return apiError(500, "CREATE_FAILED", "Something went wrong — the breakdown wasn't created.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "breakdown.created",
      entityType: "breakdowns",
      entityId: created.id,
      afterState: { name: created.name, match_date: created.match_date },
      initiatedBy: context.role === "athlete" ? "self_service" : "coach_manual",
    });

    return NextResponse.json({ success: true, breakdown: created }, { status: 201 });
  },
  { schema: createBreakdownSchema },
);
