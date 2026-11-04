import { NextResponse } from "next/server";
import { addDaysToDate, createDropInSchema, gymWallClock } from "@matos/shared";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLogStrict } from "@/lib/audit/log";
import { getGymTimeZone } from "@/lib/time/gym-timezone";
import { fetchCurrentWaiver } from "@/lib/waivers";

// How far back a visit can be recorded (a coach catching up on the week).
const MAX_DAYS_BACK = 31;
// How long visitors' records (names, contact details) are kept.
const RETENTION_DAYS = 365;

// POST /api/drop-ins — coach/owner (flow audit 4.6). Records a visitor
// against a class and date. drop_in_visits RLS (staff of the gym) and its
// trigger (class and waiver in the same gym) are the real boundary. The
// audit row holds no personal details; if it can't be written the visit is
// removed again.
export const POST = withAuth(
  async (_request, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Personal workspaces don't have visitors.");
    }
    const supabase = createClient();

    const today = gymWallClock(new Date(), await getGymTimeZone(supabase, context.gymId)).date;
    if (input.visit_date > today) {
      return apiError(400, "INVALID_DATE", "A visit can't be in the future.");
    }
    if (input.visit_date < addDaysToDate(today, -MAX_DAYS_BACK)) {
      return apiError(
        400,
        "INVALID_DATE",
        `Visits can be recorded up to ${MAX_DAYS_BACK} days back.`,
      );
    }

    if (input.class_id) {
      const { data: cls } = await supabase
        .from("classes")
        .select("id")
        .eq("id", input.class_id)
        .eq("gym_id", context.gymId)
        .maybeSingle();
      if (!cls) return apiError(400, "CLASS_NOT_FOUND", "That class isn't in your gym.");
    }

    // A typed agreement is to the gym's current waiver, recorded by version.
    let waiverVersionId: string | null = null;
    if (input.waiver_method === "typed") {
      const waiver = await fetchCurrentWaiver(supabase).catch(() => null);
      if (!waiver) {
        return apiError(
          409,
          "NO_WAIVER",
          "Your gym hasn't published a waiver yet. Record a paper waiver instead.",
        );
      }
      waiverVersionId = waiver.id;
    }

    let fee = input.fee ?? null;
    if (input.fee === undefined) {
      const { data: gym } = await supabase
        .from("gyms")
        .select("drop_in_fee")
        .eq("id", context.gymId)
        .single();
      fee = gym?.drop_in_fee == null ? null : Number(gym.drop_in_fee);
    }

    const { data: visit, error } = await supabase
      .from("drop_in_visits")
      .insert({
        gym_id: context.gymId,
        class_id: input.class_id ?? null,
        visit_date: input.visit_date,
        first_name: input.first_name,
        last_name: input.last_name,
        home_gym: input.home_gym || null,
        belt: input.belt ?? null,
        email: input.email || null,
        phone: input.phone || null,
        fee,
        fee_paid: input.fee_paid,
        waiver_method: input.waiver_method,
        waiver_version_id: waiverVersionId,
        waiver_signer_name:
          input.waiver_method === "none" ? null : input.waiver_signer_name || null,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error || !visit) {
      console.error("[drop-ins] insert failed", error);
      return apiError(500, "DROP_IN_FAILED", "Something went wrong — the visitor wasn't added.");
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "drop_in.recorded",
      entityType: "drop_in_visits",
      entityId: visit.id,
      afterState: {
        class_id: input.class_id ?? null,
        visit_date: input.visit_date,
        fee,
        fee_paid: input.fee_paid,
        waiver_method: input.waiver_method,
      },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      await supabase.from("drop_in_visits").delete().eq("id", visit.id);
      return apiError(500, "AUDIT_FAILED", "Something went wrong — the visitor wasn't added.");
    }

    // Retention (Decision Log, flow audit 4.6): visitors' details are kept
    // 12 months. Each new visit clears this gym's older ones (best effort).
    const { error: purgeError } = await supabase
      .from("drop_in_visits")
      .delete()
      .eq("gym_id", context.gymId)
      .lt("visit_date", addDaysToDate(today, -RETENTION_DAYS));
    if (purgeError) console.error("[drop-ins] retention purge failed", purgeError);

    return NextResponse.json({ success: true, id: visit.id }, { status: 201 });
  },
  { requiredRole: "coach", schema: createDropInSchema },
);
