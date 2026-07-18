import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { editMemberSchema } from "@/lib/validation/member";

// PATCH /api/members/[id] — coach/owner only. Contact/plan/notes fields
// only — belt/stripes change via .../promote, active via .../deactivate,
// each its own dedicated action per plan §7's member profile action list.
export const PATCH = withAuth(
  async (_request: NextRequest, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No member id provided.");
    const supabase = createClient();

    const { data: before } = await supabase
      .from("members")
      .select(
        "first_name, last_name, phone, emergency_contact_name, emergency_contact_phone, membership_plan, notes",
      )
      .eq("id", id)
      .single();

    if (!before) {
      return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your gym.");
    }

    const { error: updateError } = await supabase
      .from("members")
      .update({
        first_name: input.first_name,
        last_name: input.last_name,
        phone: input.phone || null,
        emergency_contact_name: input.emergency_contact_name || null,
        emergency_contact_phone: input.emergency_contact_phone || null,
        membership_plan: input.membership_plan,
        notes: input.notes || null,
      })
      .eq("id", id);

    if (updateError) {
      return apiError(
        500,
        "MEMBER_UPDATE_FAILED",
        "Something went wrong — the change wasn't saved.",
      );
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.updated",
      entityType: "members",
      entityId: id,
      beforeState: before,
      afterState: {
        first_name: input.first_name,
        last_name: input.last_name,
        phone: input.phone || null,
        emergency_contact_name: input.emergency_contact_name || null,
        emergency_contact_phone: input.emergency_contact_phone || null,
        membership_plan: input.membership_plan,
        notes: input.notes || null,
      },
      initiatedBy: input.agent_query ? "agent" : "coach_manual",
      agentQuery: input.agent_query ?? null,
    });

    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach", schema: editMemberSchema },
);
