import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { createClassSchema } from "@/lib/validation/class";

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
      })
      .select("id")
      .single();

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
      },
      initiatedBy: "coach_manual",
    });

    return NextResponse.json({ success: true, classId: created.id }, { status: 201 });
  },
  { requiredRole: "coach", schema: createClassSchema },
);
