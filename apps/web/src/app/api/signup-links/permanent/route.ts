import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { generateInviteToken, hashInviteToken } from "@/lib/auth/invite-token";
import { writeAuditLogStrict } from "@/lib/audit/log";

// The wall poster never expires; "far future" keeps expires_at's not-null
// contract. Cancelling sets used_at (see DELETE /api/signup-links/[id]).
const PERMANENT_YEARS = 100;
const PERMANENT_MAX_USES = 32000;

type Live = { id: string; display_token: string | null; use_count: number; created_at: string };

function payload(link: Live, gymName: string | null) {
  return {
    id: link.id,
    url: `${process.env.NEXT_PUBLIC_APP_URL}/join/${link.display_token}`,
    signups: link.use_count,
    createdAt: link.created_at,
    gymName,
  };
}

async function load(gymId: string) {
  const serviceRole = createServiceRoleClient();
  const [{ data: link, error }, { data: gym }] = await Promise.all([
    serviceRole
      .from("signup_links")
      .select("id, display_token, use_count, created_at")
      .eq("gym_id", gymId)
      .eq("permanent", true)
      .is("used_at", null)
      .maybeSingle(),
    serviceRole.from("gyms").select("name").eq("id", gymId).single(),
  ]);
  return { link: link as Live | null, error, gymName: gym?.name ?? null };
}

// GET /api/signup-links/permanent — owner. The academy's live permanent join
// code, so the poster can be shown or reprinted at any time.
export const GET = withAuth(
  async (_request, context) => {
    const { link, error, gymName } = await load(context.gymId);
    if (error) return apiError(500, "LINK_LOAD_FAILED", "Couldn't load the join code.");
    return NextResponse.json(
      { link: link ? payload(link, gymName) : null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
  { requiredRole: "gym_owner" },
);

// POST /api/signup-links/permanent — owner. Create the permanent join code.
// Everyone who signs up with it waits for a coach to approve them (members.
// pending_approval), so a photographed poster can't make anyone a member.
// One live code per academy (a unique index); replace = cancel, then create.
export const POST = withAuth(
  async (_request, context) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Personal workspaces don't have members to invite.");
    }
    const existing = await load(context.gymId);
    if (existing.error)
      return apiError(500, "LINK_CREATE_FAILED", "Couldn't create the join code.");
    if (existing.link) {
      return NextResponse.json(
        { link: payload(existing.link, existing.gymName) },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const serviceRole = createServiceRoleClient();
    const rawToken = generateInviteToken();
    const expiresAt = new Date(Date.now() + PERMANENT_YEARS * 365 * 24 * 3600 * 1000).toISOString();
    const { data: link, error } = await serviceRole
      .from("signup_links")
      .insert({
        gym_id: context.gymId,
        token_hash: hashInviteToken(rawToken),
        display_token: rawToken,
        expires_at: expiresAt,
        max_uses: PERMANENT_MAX_USES,
        permanent: true,
        requires_approval: true,
        created_by: context.userId,
      })
      .select("id, display_token, use_count, created_at")
      .single();
    if (error || !link) {
      if (error?.code === "23505") {
        const again = await load(context.gymId);
        if (again.link) {
          return NextResponse.json(
            { link: payload(again.link, again.gymName) },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        }
      }
      console.error("[signup-links/permanent] insert failed", error?.code);
      return apiError(500, "LINK_CREATE_FAILED", "Couldn't create the join code.");
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "signup_link.permanent_created",
      entityType: "signup_links",
      entityId: link.id,
      afterState: { requires_approval: true },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      const now = new Date().toISOString();
      await serviceRole
        .from("signup_links")
        .update({ used_at: now, expires_at: now })
        .eq("id", link.id);
      return apiError(500, "LINK_CREATE_FAILED", "Couldn't create the join code.");
    }

    return NextResponse.json(
      { link: payload(link as Live, existing.gymName) },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  },
  { requiredRole: "gym_owner" },
);
