import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { createGymPlanSchema, MAX_GYM_PLANS } from "@matos/shared";

// POST /api/gym/plans — owner only (flow audit 6.7). Adds one of the gym's
// own membership plans. gym_plans_insert_owner RLS is the real boundary;
// gym_id is always the caller's gym.
export const POST = withAuth(
  async (_request, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Personal workspaces don't have membership plans.");
    }
    const supabase = createClient();

    const { count } = await supabase
      .from("gym_plans")
      .select("id", { count: "exact", head: true })
      .eq("gym_id", context.gymId);
    if ((count ?? 0) >= MAX_GYM_PLANS) {
      return apiError(
        409,
        "TOO_MANY_PLANS",
        `A gym can have up to ${MAX_GYM_PLANS} plans. Retire one you no longer use instead.`,
      );
    }

    const { data: plan, error } = await supabase
      .from("gym_plans")
      .insert({
        gym_id: context.gymId,
        name: input.name,
        kind: input.kind,
        price: input.price,
        sort_order: Math.min(1000, ((count ?? 0) + 1) * 10),
      })
      .select("id, name, kind, price, active")
      .single();

    if (error || !plan) {
      if (error?.code === "23505") {
        return apiError(409, "PLAN_NAME_TAKEN", "You already have a plan with that name.");
      }
      console.error("[gym plans] insert failed", error);
      return apiError(500, "PLAN_CREATE_FAILED", "Something went wrong — the plan wasn't added.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "gym.plan_created",
      entityType: "gym_plans",
      entityId: plan.id,
      afterState: { name: plan.name, kind: plan.kind, price: plan.price },
      initiatedBy: "coach_manual",
    });

    return NextResponse.json({ success: true, plan }, { status: 201 });
  },
  { requiredRole: "gym_owner", schema: createGymPlanSchema },
);
