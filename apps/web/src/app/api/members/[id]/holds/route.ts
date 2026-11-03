import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLogStrict } from "@/lib/audit/log";
import { getGymTimeZone } from "@/lib/time/gym-timezone";
import { isBillable } from "@/lib/payments/overdue";
import { holdWindowError } from "@/lib/payments/hold-bounds";
import { createHoldSchema, gymWallClock } from "@matos/shared";

// POST /api/members/[id]/holds — coach/owner. Flow audit 2.4: put a member's
// membership on hold for whole months (fees not owed; check-in still works).
// RLS scopes the member read and the insert to the caller's gym; the table's
// trigger refuses overlapping holds (23P01). Audited strictly: the hold is
// removed again if the audit row can't be written.
export const POST = withAuth(
  async (_request: NextRequest, context, input, params) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Holds are for gym memberships, not personal workspaces.");
    }
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No member id provided.");
    const supabase = createClient();

    const { data: member } = await supabase
      .from("members")
      .select("id, first_name, last_name, role, membership_plan, active")
      .eq("id", id)
      .maybeSingle();
    if (!member) {
      return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your gym.");
    }
    if (!member.active) {
      return apiError(
        409,
        "MEMBER_INACTIVE",
        "Reactivate this member before putting them on hold.",
      );
    }
    if (!isBillable(member)) {
      return apiError(
        409,
        "NOT_BILLABLE",
        "Only members who pay a monthly fee can be put on hold. Coaches and casual members don't owe one.",
      );
    }

    const timeZone = await getGymTimeZone(supabase, context.gymId);
    const today = gymWallClock(new Date(), timeZone).date;
    const windowError = holdWindowError(input.start_month, input.end_month, today);
    if (windowError) return apiError(400, "INVALID_HOLD", windowError);

    const { data: created, error: insertError } = await supabase
      .from("membership_holds")
      .insert({
        gym_id: context.gymId, // overwritten from the member by trigger
        member_id: id,
        start_month: `${input.start_month}-01`,
        end_month: `${input.end_month}-01`,
      })
      .select("id, start_month, end_month")
      .single();
    if (insertError?.code === "23P01") {
      return apiError(
        409,
        "HOLD_OVERLAPS",
        "That overlaps a hold this member already has. Change or remove that one first.",
      );
    }
    if (insertError || !created) {
      console.error("[holds] insert failed", insertError);
      return apiError(500, "HOLD_CREATE_FAILED", "Something went wrong — the hold wasn't saved.");
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.hold_added",
      entityType: "membership_holds",
      entityId: created.id,
      afterState: {
        member_id: id,
        start_month: created.start_month,
        end_month: created.end_month,
      },
      initiatedBy: input.agent_query ? "agent" : "coach_manual",
      agentQuery: input.agent_query ?? null,
    });
    if (!audited) {
      await supabase.from("membership_holds").delete().eq("id", created.id);
      return apiError(500, "HOLD_CREATE_FAILED", "Something went wrong — the hold wasn't saved.");
    }

    return NextResponse.json({ success: true, holdId: created.id }, { status: 201 });
  },
  { requiredRole: "coach", schema: createHoldSchema },
);
