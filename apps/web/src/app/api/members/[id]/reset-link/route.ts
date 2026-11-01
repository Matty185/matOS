import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLogStrict } from "@/lib/audit/log";

// POST /api/members/[id]/reset-link — coach/owner. Stage O2: "forgot my
// password" without a verified email domain. The member asks their coach
// at the gym; the coach generates a one-hour, single-use reset link and
// hands it over (same channels as invite links). Supabase Auth's
// admin.generateLink({type:'recovery'}) mints the token WITHOUT sending
// email; we build our own /reset-password?token_hash=… URL so the page can
// verify it with verifyOtp (the @supabase/ssr-compatible flow) only when
// the member actually submits a new password — a link preview fetching the
// URL can't consume it.
//
// Trust model: a coach can already create, invite and (before claim) take
// over any athlete account in their gym — that's how accounts come to
// exist here. Post-claim reset is a real capability on top of that (it
// would let a coach read an athlete's private, not-visible-to-coach logs),
// so it is bounded:
//   - athletes: coach or owner; coach/owner rows: owner only (team
//     management is owner-only, plan §4);
//   - never your own row (use /account while signed in);
//   - refused if the account also belongs to any other gym or a personal
//     workspace — this gym's staff must not be able to reset a password
//     that unlocks data held somewhere else;
//   - every link is audit-logged with the actor BEFORE it's minted (no
//     audit row → no link).
// Service-role scope: a deliberate addition to CLAUDE.md Rule 4 (Admin
// Auth API for recovery links), recorded in the 2026-10-30 Decision Log.
export const POST = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No member id provided.");

    const supabase = createClient();
    const { data: member } = await supabase
      .from("members")
      .select("id, gym_id, user_id, role, active, first_name")
      .eq("id", id)
      .single();

    if (!member) {
      return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your gym.");
    }
    if (member.id === context.memberId) {
      return apiError(400, "OWN_ACCOUNT", "Change your own password from your Account page.");
    }
    if (!member.active) {
      return apiError(409, "MEMBER_INACTIVE", "This member is deactivated.");
    }
    if (!member.user_id) {
      return apiError(
        409,
        "NOT_CLAIMED",
        "This member hasn't set up their account yet — send them an invite link instead.",
      );
    }
    if (member.role !== "athlete" && context.role !== "gym_owner") {
      return apiError(403, "FORBIDDEN", "Only the gym owner can reset a coach's password.");
    }

    const serviceRole = createServiceRoleClient();

    const { count: otherMemberships, error: membershipsError } = await serviceRole
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", member.user_id)
      .neq("gym_id", member.gym_id);
    if (membershipsError) {
      console.error("[reset-link] membership check failed", membershipsError);
      return apiError(500, "RESET_LINK_FAILED", "Something went wrong — no link was created.");
    }
    if ((otherMemberships ?? 0) > 0) {
      return apiError(
        409,
        "ACCOUNT_SHARED",
        `${member.first_name}'s MatOS account is also used outside your gym, so they need to reset it themselves.`,
      );
    }

    const { data: authUser, error: userError } = await serviceRole.auth.admin.getUserById(
      member.user_id,
    );
    const authEmail = authUser?.user?.email;
    if (userError || !authEmail) {
      console.error("[reset-link] auth user lookup failed", userError);
      return apiError(500, "RESET_LINK_FAILED", "Something went wrong — no link was created.");
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.password_reset_link_created",
      entityType: "members",
      entityId: member.id,
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      return apiError(500, "RESET_LINK_FAILED", "Something went wrong — no link was created.");
    }

    const { data: link, error: linkError } = await serviceRole.auth.admin.generateLink({
      type: "recovery",
      email: authEmail,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error("[reset-link] generateLink failed", linkError);
      return apiError(500, "RESET_LINK_FAILED", "Something went wrong — no link was created.");
    }

    const url = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token_hash=${encodeURIComponent(tokenHash)}`;
    return NextResponse.json(
      { success: true, url },
      // The URL is a credential — never cache this response.
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
  { requiredRole: "coach" },
);
