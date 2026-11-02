import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { editMemberSchema } from "@matos/shared";

// PATCH /api/members/[id] — coach/owner only. Contact/plan/notes fields
// only — belt/stripes change via .../promote, active via .../deactivate,
// each its own dedicated action per plan §7's member profile action list.
//
// Email (flow audit 1.11) can be corrected or removed only while the member
// hasn't signed up. Once they have, it mirrors their login (auth.users) and
// changing it here would silently break their sign-in.
export const PATCH = withAuth(
  async (_request: NextRequest, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No member id provided.");
    const supabase = createClient();

    const { data: before } = await supabase
      .from("members")
      .select(
        "first_name, last_name, email, user_id, phone, emergency_contact_name, emergency_contact_phone, membership_plan, notes",
      )
      .eq("id", id)
      .single();

    if (!before) {
      return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your gym.");
    }

    const emailChanged = input.email !== undefined && input.email !== before.email;
    if (emailChanged && before.user_id) {
      return apiError(
        409,
        "EMAIL_LOCKED",
        `${before.first_name} signs in with this email, so it can't be changed here.`,
      );
    }

    // An unused invite is bound to the member row and claims with whatever
    // email the row has *at claim time*, so a link sent to the old address
    // must die with it (same rule as a role change, O4/O5 B1). Fail-closed.
    if (emailChanged) {
      const { error: expireError } = await createServiceRoleClient()
        .from("invites")
        .update({ expires_at: new Date().toISOString() })
        .eq("member_id", id)
        .is("claimed_at", null);
      if (expireError) {
        console.error("[members] failed to expire invites before email change", expireError);
        return apiError(
          500,
          "MEMBER_UPDATE_FAILED",
          "Something went wrong — the change wasn't saved.",
        );
      }
    }

    let update = supabase
      .from("members")
      .update({
        ...(emailChanged ? { email: input.email } : {}),
        first_name: input.first_name,
        last_name: input.last_name,
        phone: input.phone || null,
        emergency_contact_name: input.emergency_contact_name || null,
        emergency_contact_phone: input.emergency_contact_phone || null,
        membership_plan: input.membership_plan,
        notes: input.notes || null,
      })
      .eq("id", id);
    // A claim landing between the read above and this write must win: the
    // email is then their login. Zero rows updated = they just signed up.
    if (emailChanged) update = update.is("user_id", null);
    const { data: updatedRows, error: updateError } = await update.select("id");

    if (!updateError && emailChanged && (!updatedRows || updatedRows.length === 0)) {
      return apiError(
        409,
        "EMAIL_LOCKED",
        `${before.first_name} has just signed up with this email, so it can't be changed here.`,
      );
    }

    if (updateError) {
      if (updateError.code === "23505") {
        return apiError(409, "EMAIL_TAKEN", "Someone in your gym already has this email.");
      }
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
      beforeState: {
        first_name: before.first_name,
        last_name: before.last_name,
        ...(emailChanged ? { email: before.email } : {}),
        phone: before.phone,
        emergency_contact_name: before.emergency_contact_name,
        emergency_contact_phone: before.emergency_contact_phone,
        membership_plan: before.membership_plan,
        notes: before.notes,
      },
      afterState: {
        ...(emailChanged ? { email: input.email ?? null } : {}),
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
