import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLogStrict } from "@/lib/audit/log";
import { addGuardianSchema } from "@matos/shared";

// POST /api/members/[id]/guardians — coach/owner. Flow audit 8.2: give a
// child (an athlete) a parent account. If someone in this gym already has
// that email (a parent who trains, a coach, a sibling's parent) they are
// linked; otherwise a new member with role 'guardian' is created — no login
// until they claim the invite the coach then shares. Done atomically by the
// add_guardian RPC (SECURITY INVOKER, so RLS and the DB triggers — same gym,
// child is an athlete, coaches can't create staff — are the real gates).
// Audit-first, fail-closed; the audit row carries no email.
export const POST = withAuth(
  async (_request: NextRequest, context, input, params) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Parent accounts are for gyms, not personal workspaces.");
    }
    const childId = params.id;
    if (!childId) return apiError(400, "MISSING_ID", "No member id provided.");
    const supabase = createClient();

    const { data: child } = await supabase
      .from("members")
      .select("id, role, active, email")
      .eq("id", childId)
      .maybeSingle();
    if (!child) {
      return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your gym.");
    }
    if (child.role !== "athlete") {
      return apiError(409, "NOT_ATHLETE", "Only athletes can have a parent account linked.");
    }
    if (!child.active) {
      return apiError(409, "MEMBER_INACTIVE", "Reactivate this member first.");
    }
    if (child.email && child.email.toLowerCase() === input.email) {
      return apiError(400, "SAME_EMAIL", "That's the member's own email. Use the parent's email.");
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.guardian_linked",
      entityType: "members",
      entityId: childId,
      afterState: { child_member_id: childId },
      initiatedBy: input.agent_query ? "agent" : "coach_manual",
      agentQuery: input.agent_query ?? null,
    });
    if (!audited) {
      return apiError(500, "GUARDIAN_FAILED", "Something went wrong — nothing was saved.");
    }

    const { data, error } = await supabase.rpc("add_guardian", {
      p_child_member_id: childId,
      p_first_name: input.first_name,
      p_last_name: input.last_name,
      p_email: input.email,
    });
    const row = data?.[0];
    if (error || !row) {
      if (error?.code === "23505") {
        // Tell the two unique constraints apart by name.
        return error.message.includes("member_guardians_unique")
          ? apiError(409, "ALREADY_LINKED", "That parent is already linked to this member.")
          : apiError(
              409,
              "EMAIL_IN_USE",
              "That email was just used for another member. Try again.",
            );
      }
      if (error?.code === "55000") {
        return apiError(
          409,
          "GUARDIAN_INACTIVE",
          "Someone with that email is an inactive member. Reactivate them first, then link them.",
        );
      }
      if (error?.code === "22023") {
        return apiError(
          400,
          "INVALID_LINK",
          "That person can't be linked as this member's parent.",
        );
      }
      console.error("[guardians] add_guardian failed", error?.code);
      return apiError(500, "GUARDIAN_FAILED", "Something went wrong — nothing was saved.");
    }

    return NextResponse.json(
      { success: true, guardianMemberId: row.guardian_member_id, created: row.created },
      { status: 201 },
    );
  },
  { requiredRole: "coach", schema: addGuardianSchema },
);
