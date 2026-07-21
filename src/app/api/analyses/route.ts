import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { createAnalysisSchema } from "@/lib/validation/analysis";

// POST /api/analyses — starts a manual-entry match log. Any authenticated
// member may call this: an athlete logging their own match omits member_id
// (defaults to their own), a coach/owner logging on an athlete's behalf
// supplies it. No requiredRole gate here — the actual boundary is RLS
// (analyses_insert_self / analyses_insert_staff), matching CLAUDE.md Rule 2
// ("RLS at the database layer is the security boundary; application-layer
// checks are UX convenience only"). An athlete who supplies someone else's
// member_id gets rejected by Postgres, mapped to 403 below, not by an
// app-level role branch.
//
// method is always 'manual' here — see the schema's own comment for why
// 'ai_stub' is never accepted from a client. status starts 'pending',
// repurposed for the manual path as "still being logged," not
// "processing"; the athlete/coach explicitly finishes via
// PATCH /api/analyses/:id { mark_complete: true }.
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();
    const memberId = input.member_id ?? context.memberId;

    const { data: created, error: insertError } = await supabase
      .from("analyses")
      .insert({
        member_id: memberId,
        gym_id: context.gymId,
        title: input.title,
        method: "manual",
        status: "pending",
        created_by: context.userId,
        visible_to_athlete: true,
      })
      .select("id, title, status, method, created_at")
      .single();

    if (insertError || !created) {
      if (insertError?.message?.includes("row-level security")) {
        return apiError(403, "FORBIDDEN", "You can't log a match for that member.");
      }
      console.error("[analyses] insert failed", insertError);
      return apiError(500, "CREATE_FAILED", "Something went wrong — the match wasn't created.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "analysis.created",
      entityType: "analyses",
      entityId: created.id,
      afterState: { title: created.title, status: created.status, method: created.method },
      initiatedBy: memberId === context.memberId ? "self_service" : "coach_manual",
    });

    return NextResponse.json({ success: true, analysis: created }, { status: 201 });
  },
  { schema: createAnalysisSchema },
);
