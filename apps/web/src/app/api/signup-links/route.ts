import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { generateInviteToken, hashInviteToken, inviteExpiryDate } from "@/lib/auth/invite-token";
import { writeAuditLogStrict } from "@/lib/audit/log";

// POST /api/signup-links — coach/owner. Stage O7: mint a one-time sign-up
// link not tied to any member row; whoever opens it fills in their own
// details and joins as an athlete (see /api/join/[token]). Same token
// handling as invites: raw token returned once, only its hash stored,
// audit-logged before it leaves this route (fail-closed).
const MAX_UNUSED_LINKS = 30;

export const POST = withAuth(
  async (_request, context) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Personal workspaces don't have members to invite.");
    }

    const serviceRole = createServiceRoleClient();

    // Cap live unused links per gym, so links can't be minted without limit
    // and used to bulk-probe or pre-register email addresses.
    const { count, error: countError } = await serviceRole
      .from("signup_links")
      .select("id", { count: "exact", head: true })
      .eq("gym_id", context.gymId)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString());
    if (countError) {
      console.error("[signup-links] count failed", countError);
      return apiError(500, "LINK_CREATE_FAILED", "Something went wrong — the link wasn't created.");
    }
    if ((count ?? 0) >= MAX_UNUSED_LINKS) {
      return apiError(
        409,
        "TOO_MANY_LINKS",
        `You have ${MAX_UNUSED_LINKS} unused sign-up links. Cancel some you no longer need first.`,
      );
    }

    const rawToken = generateInviteToken();
    const expiresAt = inviteExpiryDate();

    const { data: link, error } = await serviceRole
      .from("signup_links")
      .insert({
        gym_id: context.gymId,
        token_hash: hashInviteToken(rawToken),
        expires_at: expiresAt,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error || !link) {
      console.error("[signup-links] insert failed", error);
      return apiError(500, "LINK_CREATE_FAILED", "Something went wrong — the link wasn't created.");
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "signup_link.created",
      entityType: "signup_links",
      entityId: link.id,
      afterState: { expires_at: expiresAt },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      await serviceRole
        .from("signup_links")
        .update({ expires_at: new Date().toISOString() })
        .eq("id", link.id);
      return apiError(500, "LINK_CREATE_FAILED", "Something went wrong — the link wasn't created.");
    }

    const { data: gym } = await serviceRole
      .from("gyms")
      .select("name")
      .eq("id", context.gymId)
      .single();

    return NextResponse.json(
      {
        id: link.id,
        url: `${process.env.NEXT_PUBLIC_APP_URL}/join/${rawToken}`,
        expiresAt,
        gymName: gym?.name ?? null,
      },
      { status: 201 },
    );
  },
  { requiredRole: "coach" },
);
