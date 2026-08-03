import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { athleteLogSchema } from "@matos/shared";

// POST /api/logs — any authenticated member, always self (context.memberId,
// never client-supplied) — matches athlete_logs_all_self RLS (Stage 1),
// which independently enforces the same scoping regardless of role.
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();

    const { data: created, error: insertError } = await supabase
      .from("athlete_logs")
      .insert({
        member_id: context.memberId,
        gym_id: context.gymId,
        entry_date: input.entry_date,
        working_on: input.working_on || null,
        struggling_with: input.struggling_with || null,
        notes: input.notes || null,
        visible_to_coach: input.visible_to_coach,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      return apiError(500, "LOG_CREATE_FAILED", "Something went wrong — the entry wasn't saved.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "athlete_log.created",
      entityType: "athlete_logs",
      entityId: created.id,
      initiatedBy: "self_service",
    });

    return NextResponse.json({ success: true, id: created.id }, { status: 201 });
  },
  { schema: athleteLogSchema },
);
