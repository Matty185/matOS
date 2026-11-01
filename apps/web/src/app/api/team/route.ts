import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLogStrict } from "@/lib/audit/log";
import { addCoachSchema } from "@matos/shared";

// POST /api/team — owner only. Stage O5: add a coach (plan §4 "Owner =
// coach permissions + manage coach profiles"). Goes through import_members
// with p_role 'coach' — the enforce_member_role_insert_guard trigger
// independently refuses an elevated role from anyone but an owner, so
// requiredRole below is the UX layer, not the boundary. Creating an owner
// directly isn't offered: promote an existing coach instead (one more
// deliberate step for the most powerful role).
//
// If the person is already a member (e.g. an athlete who now coaches),
// the owner should change their role on the Team page rather than create
// a duplicate — surfaced as a clear 409.
export const POST = withAuth(
  async (_request, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Personal workspaces don't have a team.");
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("import_members", {
      p_gym_id: context.gymId,
      p_role: "coach",
      p_rows: [
        {
          first_name: input.first_name,
          last_name: input.last_name,
          email: input.email,
          belt: input.belt,
          stripes: input.stripes,
        },
      ],
    });
    const coach = data?.[0];

    if (error || !coach) {
      if (error?.code === "23505") {
        return apiError(
          409,
          "EMAIL_TAKEN",
          "Someone with this email is already in your gym — change their role from the team list instead.",
        );
      }
      console.error("[team] add coach failed", error);
      return apiError(500, "COACH_CREATE_FAILED", "Something went wrong — the coach wasn't added.");
    }

    // Strict: a new staff row without an audit trail is not acceptable. The
    // row is unclaimed (no login yet), so on failure it is deactivated
    // rather than left as an unrecorded coach.
    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "team.coach_added",
      entityType: "members",
      entityId: coach.id,
      afterState: { first_name: input.first_name, last_name: input.last_name, role: "coach" },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      const { error: rollbackError } = await supabase
        .from("members")
        .update({ active: false })
        .eq("id", coach.id);
      if (rollbackError) {
        console.error(
          "[team] UNAUDITED coach row left active — manual follow-up",
          coach.id,
          rollbackError,
        );
      }
      return apiError(500, "COACH_CREATE_FAILED", "Something went wrong — the coach wasn't added.");
    }

    return NextResponse.json({ success: true, memberId: coach.id }, { status: 201 });
  },
  { requiredRole: "gym_owner", schema: addCoachSchema },
);
