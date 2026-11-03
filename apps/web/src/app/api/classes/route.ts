import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { createClassSchema } from "@matos/shared";

// POST /api/classes — coach/owner only. start_time arrives as "HH:MM" from
// the form; Postgres's `time` column accepts that directly.
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();

    const { data: created, error: insertError } = await supabase
      .from("classes")
      .insert({
        gym_id: context.gymId,
        name: input.name,
        class_type: input.class_type,
        day_of_week: input.day_of_week,
        start_time: input.start_time,
        duration_minutes: input.duration_minutes,
        max_capacity: input.max_capacity ?? null,
        // Flow audit 3.3/3.4. The classes_check_coach trigger refuses a
        // coach who isn't an active coach/owner of this gym (22023).
        coach_member_id: input.coach_member_id ?? null,
        program: input.program ?? "all_levels",
      })
      .select("id")
      .single();

    if (insertError?.code === "22023") {
      return apiError(400, "INVALID_COACH", "Pick an active coach or owner from your gym.");
    }
    if (insertError || !created) {
      return apiError(500, "CLASS_CREATE_FAILED", "Something went wrong — the class wasn't saved.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "class.created",
      entityType: "classes",
      entityId: created.id,
      afterState: {
        name: input.name,
        day_of_week: input.day_of_week,
        start_time: input.start_time,
        coach_member_id: input.coach_member_id ?? null,
        program: input.program ?? "all_levels",
      },
      initiatedBy: input.agent_query ? "agent" : "coach_manual",
      agentQuery: input.agent_query ?? null,
    });

    return NextResponse.json({ success: true, classId: created.id }, { status: 201 });
  },
  { requiredRole: "coach", schema: createClassSchema },
);
