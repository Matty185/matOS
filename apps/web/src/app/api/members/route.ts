import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createInvite } from "@/lib/auth/create-invite";
import { isInviteEmailEnabled } from "@/lib/email/invite";
import { writeAuditLog } from "@/lib/audit/log";
import { resolvePlan } from "@/lib/payments/resolve-plan";
import { createMemberSchema } from "@matos/shared";

// POST /api/members — coach/owner only. Creates an athlete member row (this
// form never creates coach/owner rows — see Stage 1's role-escalation
// trigger and CLAUDE.md's owner-only "coach management," which this app
// doesn't build in the alpha). Plan §7's "on add, invite email sent
// automatically" now applies only when email is enabled (Stage O2).
export const POST = withAuth(
  async (_request, context, input) => {
    // Stage S2: a personal workspace's role is gym_owner, which satisfies
    // `requiredRole: "coach"` below — without this check, a solo user
    // could add extra member rows to their own personal gym via this
    // route directly (no UI path leads here, but the API itself didn't
    // block it). Several parts of the S2 design assume a personal
    // workspace stays single-member (most concretely, api/account/
    // delete-solo only ever targets the caller's own member row) — a
    // database-reviewer finding surfaced during S2's gate, not a
    // hypothetical.
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "You can't add members to a personal workspace.");
    }

    const supabase = createClient();

    // Flow audit 6.7: the gym's own plan, when chosen, sets the billing type.
    let membershipPlan = input.membership_plan;
    if (input.plan_id) {
      const plan = await resolvePlan(supabase, context.gymId, input.plan_id);
      if (!plan.ok)
        return apiError(400, "INVALID_PLAN", "Choose one of your academy's current plans.");
      membershipPlan = plan.kind;
    }

    // Stage O2: via import_members (one row) rather than a bare insert, so
    // the starting rank lands atomically as an is_initial belt_history row
    // alongside the member — same path as bulk import (/api/members/import).
    // p_gym_id/p_role are server-chosen, never from the request body.
    const { data: inserted, error: insertError } = await supabase.rpc("import_members", {
      p_gym_id: context.gymId,
      p_role: "athlete",
      p_rows: [
        {
          first_name: input.first_name,
          last_name: input.last_name,
          email: input.email,
          phone: input.phone || null,
          emergency_contact_name: input.emergency_contact_name || null,
          emergency_contact_phone: input.emergency_contact_phone || null,
          membership_plan: membershipPlan,
          notes: input.notes || null,
          belt: input.belt,
          stripes: input.stripes,
          join_date: input.join_date || null,
        },
      ],
    });
    const member = inserted?.[0];

    if (insertError || !member) {
      // members_gym_email_unique (Stage 1) is the likely cause of a
      // conflict here — another member in this gym already has this email.
      if (insertError?.code === "23505") {
        return apiError(
          409,
          "EMAIL_TAKEN",
          "A member with this email already exists in your academy.",
        );
      }
      console.error("[members] create failed", insertError);
      return apiError(
        500,
        "MEMBER_CREATE_FAILED",
        "Something went wrong — the member wasn't added.",
      );
    }

    // The insert trigger put them on the gym's first plan of that type; move
    // them to the one chosen. Same type, so billing is right even if this
    // fails (logged).
    if (input.plan_id) {
      const { error: planError } = await supabase
        .from("members")
        .update({ plan_id: input.plan_id })
        .eq("id", member.id);
      if (planError) console.error("[members] setting plan after create failed", planError);
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.created",
      entityType: "members",
      entityId: member.id,
      afterState: { first_name: input.first_name, last_name: input.last_name, email: input.email },
      initiatedBy: "coach_manual",
    });

    // Stage O2: auto-invite by email only once a verified sending domain is
    // configured. Otherwise the coach shares the invite link from the
    // member's profile (the create form routes straight there with the
    // share dialog open).
    let inviteSent = false;
    let inviteError: string | null = null;
    if (isInviteEmailEnabled() && input.email) {
      const { data: gym } = await supabase
        .from("gyms")
        .select("name")
        .eq("id", context.gymId)
        .single();

      const inviteResult = await createInvite({
        memberId: member.id,
        memberGymId: context.gymId,
        memberFirstName: input.first_name,
        memberEmail: input.email,
        gymName: gym?.name ?? "your academy",
        actorUserId: context.userId,
        delivery: "email",
      });
      inviteSent = inviteResult.ok;
      inviteError = inviteResult.ok ? null : inviteResult.message;
    }

    // The member record is real, useful data regardless of whether the
    // invite email happened to send — don't roll it back over an email
    // provider hiccup.
    return NextResponse.json(
      {
        success: true,
        memberId: member.id,
        emailEnabled: isInviteEmailEnabled(),
        inviteSent,
        inviteError,
      },
      { status: 201 },
    );
  },
  { requiredRole: "coach", schema: createMemberSchema },
);
