import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { generateInviteToken, hashInviteToken } from "@/lib/auth/invite-token";
import { writeAuditLogStrict } from "@/lib/audit/log";

const SHARED_LINK_HOURS = 24;
const SHARED_LINK_MAX_USES = 60;

// POST /api/signup-links/shared — owner only. A printed QR code that several
// people can use at a class. More exposed than a one-time link, so it is
// owner-only, one live link per academy, short-lived and capped. Athlete
// accounts only, and new accounts only (see /api/join/[token]).
export const POST = withAuth(
  async (_request, context) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Personal workspaces don't have members to invite.");
    }

    const serviceRole = createServiceRoleClient();

    const { count, error: countError } = await serviceRole
      .from("signup_links")
      .select("id", { count: "exact", head: true })
      .eq("gym_id", context.gymId)
      .gt("max_uses", 1)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString());
    if (countError) {
      console.error("[signup-links/shared] count failed", countError);
      return apiError(500, "LINK_CREATE_FAILED", "Something went wrong — the link wasn't created.");
    }
    if ((count ?? 0) > 0) {
      return apiError(
        409,
        "SHARED_LINK_LIVE",
        "A group QR code is already live. Cancel it below before making a new one.",
      );
    }

    const rawToken = generateInviteToken();
    const expiresAt = new Date(Date.now() + SHARED_LINK_HOURS * 3600 * 1000).toISOString();

    const { data: link, error } = await serviceRole
      .from("signup_links")
      .insert({
        gym_id: context.gymId,
        token_hash: hashInviteToken(rawToken),
        expires_at: expiresAt,
        max_uses: SHARED_LINK_MAX_USES,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !link) {
      console.error("[signup-links/shared] insert failed", error);
      return apiError(500, "LINK_CREATE_FAILED", "Something went wrong — the link wasn't created.");
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "signup_link.shared_created",
      entityType: "signup_links",
      entityId: link.id,
      afterState: { expires_at: expiresAt, max_uses: SHARED_LINK_MAX_USES },
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
        maxUses: SHARED_LINK_MAX_USES,
        gymName: gym?.name ?? null,
      },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  },
  { requiredRole: "gym_owner" },
);
