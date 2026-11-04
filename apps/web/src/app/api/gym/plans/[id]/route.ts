import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog, writeAuditLogStrict } from "@/lib/audit/log";
import { updateGymPlanSchema } from "@matos/shared";

// PATCH /api/gym/plans/[id] — owner only (flow audit 6.7). Rename, change
// the price, or retire/restore a plan. The billing type can't change (the
// column grant leaves it out); there is no delete — members on a retired
// plan keep it.
export const PATCH = withAuth(
  async (_request, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No plan id provided.");
    const supabase = createClient();

    const { data: before } = await supabase
      .from("gym_plans")
      .select("id, name, price, active, payment_link_url")
      .eq("id", id)
      .eq("gym_id", context.gymId)
      .maybeSingle();
    if (!before) return apiError(404, "PLAN_NOT_FOUND", "That plan wasn't found.");

    const change: {
      name?: string;
      price?: number | null;
      active?: boolean;
      payment_link_url?: string | null;
    } = {};
    if (input.payment_link_url !== undefined) change.payment_link_url = input.payment_link_url;
    if (input.name !== undefined) change.name = input.name;
    if (input.price !== undefined) change.price = input.price;
    if (input.active !== undefined) change.active = input.active;

    const { data: rows, error } = await supabase
      .from("gym_plans")
      .update(change)
      .eq("id", id)
      .eq("gym_id", context.gymId)
      .select("id");

    if (error || !rows || rows.length === 0) {
      if (error?.code === "23505") {
        return apiError(409, "PLAN_NAME_TAKEN", "You already have a plan with that name.");
      }
      console.error("[gym plans] update failed", error);
      return apiError(500, "PLAN_UPDATE_FAILED", "Something went wrong — the change wasn't saved.");
    }

    const audit = {
      gymId: context.gymId,
      actorId: context.userId,
      action: "gym.plan_updated",
      entityType: "gym_plans",
      entityId: id,
      beforeState: {
        name: before.name,
        price: before.price,
        active: before.active,
        payment_link_url: before.payment_link_url,
      },
      afterState: change,
      initiatedBy: "coach_manual" as const,
    };
    // Flow audit 6.6: a payment link decides where members' money goes, so a
    // change to it is audited strictly and reverted if the record can't be
    // written. Other plan edits stay best effort.
    const linkChanged =
      change.payment_link_url !== undefined && change.payment_link_url !== before.payment_link_url;
    if (linkChanged) {
      if (!(await writeAuditLogStrict(audit))) {
        // Revert only what this request changed, so a concurrent edit to
        // other fields isn't overwritten.
        const revert: typeof change = {};
        if (change.name !== undefined) revert.name = before.name;
        if (change.price !== undefined) revert.price = before.price;
        if (change.active !== undefined) revert.active = before.active;
        revert.payment_link_url = before.payment_link_url;
        const { error: revertError } = await supabase.from("gym_plans").update(revert).eq("id", id);
        if (revertError) {
          console.error("[gym plans] audit failed AND revert failed — unaudited link live", {
            planId: id,
            revertError,
          });
          return apiError(
            500,
            "AUDIT_AND_REVERT_FAILED",
            "Something went wrong and the link may have changed. Check the plan and try again.",
          );
        }
        return apiError(500, "AUDIT_FAILED", "Something went wrong — the change wasn't saved.");
      }
    } else {
      await writeAuditLog(audit);
    }

    return NextResponse.json({ success: true });
  },
  { requiredRole: "gym_owner", schema: updateGymPlanSchema },
);
