import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createAndSendInvite } from "@/lib/auth/create-invite";
import { writeAuditLog } from "@/lib/audit/log";
import { createMemberSchema } from "@matos/shared";

// POST /api/members — coach/owner only. Creates an athlete member row (this
// form never creates coach/owner rows — see Stage 1's role-escalation
// trigger and CLAUDE.md's owner-only "coach management," which this app
// doesn't build in the alpha) and automatically sends the invite email per
// plan §7 ("on add, invite email sent automatically").
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

    const { data: member, error: insertError } = await supabase
      .from("members")
      .insert({
        gym_id: context.gymId,
        role: "athlete",
        first_name: input.first_name,
        last_name: input.last_name,
        email: input.email,
        phone: input.phone || null,
        emergency_contact_name: input.emergency_contact_name || null,
        emergency_contact_phone: input.emergency_contact_phone || null,
        membership_plan: input.membership_plan,
        notes: input.notes || null,
      })
      .select("id")
      .single();

    if (insertError || !member) {
      // members_gym_email_unique (Stage 1) is the likely cause of a
      // conflict here — another member in this gym already has this email.
      if (insertError?.code === "23505") {
        return apiError(409, "EMAIL_TAKEN", "A member with this email already exists in your gym.");
      }
      return apiError(
        500,
        "MEMBER_CREATE_FAILED",
        "Something went wrong — the member wasn't added.",
      );
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

    const { data: gym } = await supabase
      .from("gyms")
      .select("name")
      .eq("id", context.gymId)
      .single();

    const inviteResult = await createAndSendInvite({
      memberId: member.id,
      memberGymId: context.gymId,
      memberFirstName: input.first_name,
      memberEmail: input.email,
      gymName: gym?.name ?? "your gym",
      actorUserId: context.userId,
    });

    // The member record is real, useful data regardless of whether the
    // invite email happened to send — don't roll it back over an email
    // provider hiccup. Surface the failure so the coach knows to resend
    // rather than assume it went out.
    return NextResponse.json(
      {
        success: true,
        memberId: member.id,
        inviteSent: inviteResult.ok,
        inviteError: inviteResult.ok ? null : inviteResult.message,
      },
      { status: 201 },
    );
  },
  { requiredRole: "coach", schema: createMemberSchema },
);
