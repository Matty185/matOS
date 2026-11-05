import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { promoteMember } from "@/lib/promotions/promote";
import { gradingDaySchema } from "@matos/shared";

// POST /api/promotions/grading — coach/owner. Flow audit 5.4: grading day,
// several promotions at once with one shared note. Each member goes through
// promoteMember exactly as a single promotion does (rank, belt history,
// audit row tagged grading_day, push), one after another; a failure for one
// member doesn't stop the rest, and the response says who succeeded. A
// summary audit row records the grading itself.
export const maxDuration = 60;
const BATCH = 5;

export const POST = withAuth(
  async (_request, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Grading day is for academies, not personal workspaces.");
    }
    const supabase = createClient();
    // Small parallel batches: quick enough for the function time limit,
    // gentle on the database. Each promotion is still independent.
    const results: { member_id: string; ok: boolean; code?: string }[] = [];
    for (let i = 0; i < input.promotions.length; i += BATCH) {
      const chunk = input.promotions.slice(i, i + BATCH);
      const done = await Promise.all(
        chunk.map((p) =>
          promoteMember(
            supabase,
            { gymId: context.gymId, userId: context.userId },
            p.member_id,
            { belt: p.belt, stripes: p.stripes, notes: input.notes },
            { initiatedBy: "coach_manual", agentQuery: null, gradingDay: true },
          ).then((r) =>
            r.ok
              ? { member_id: p.member_id, ok: true }
              : { member_id: p.member_id, ok: false, code: r.code },
          ),
        ),
      );
      results.push(...done);
    }
    const promoted = results.filter((r) => r.ok).length;

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "promotion.grading_day",
      entityType: "gyms",
      entityId: context.gymId,
      afterState: { promoted, failed: results.length - promoted },
      initiatedBy: "coach_manual",
    });

    // Nobody promoted is a failure, not a 200.
    return NextResponse.json(
      { success: promoted > 0, promoted, results },
      { status: promoted > 0 ? 200 : 409 },
    );
  },
  { requiredRole: "coach", schema: gradingDaySchema },
);
