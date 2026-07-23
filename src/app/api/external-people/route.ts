import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { createExternalPersonSchema } from "@/lib/validation/external-person";

// POST /api/external-people — any authenticated member, self or staff.
// Unlike breakdowns, external_people.gym_id isn't trigger-derived (no
// member relationship to derive it from) — it's the real, trusted value
// here, server-injected from context.gymId, never taken from the request
// body, same posture as every other gym-level table.
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();

    const { data: created, error: insertError } = await supabase
      .from("external_people")
      .insert({
        gym_id: context.gymId,
        created_by: context.userId,
        display_name: input.display_name,
        notes: input.notes ?? null,
      })
      .select("id, display_name")
      .single();

    if (insertError || !created) {
      console.error("[external-people] insert failed", insertError);
      return apiError(500, "CREATE_FAILED", "Something went wrong — the person wasn't saved.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "external_person.created",
      entityType: "external_people",
      entityId: created.id,
      afterState: { display_name: created.display_name },
      initiatedBy: context.role === "athlete" ? "self_service" : "coach_manual",
    });

    return NextResponse.json({ success: true, person: created }, { status: 201 });
  },
  { schema: createExternalPersonSchema },
);
