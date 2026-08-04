import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { generateShareToken, hashShareToken } from "@/lib/auth/share-token";
import { writeAuditLog } from "@/lib/audit/log";
import { createShareLinkSchema } from "@matos/shared";

// POST /api/share-links — any authenticated member. Ownership/visibility
// is checked by attempting an RLS-respecting read of the subject rather
// than reimplementing authorization logic here: if the caller can already
// SELECT the member/external_person/breakdown through existing RLS
// (breakdowns_all_own + breakdowns_select_staff, external_people_all_self
// + external_people_all_staff, members_select_self + members_select_staff),
// they're allowed to create a share link for it — sharing something you
// can already see in-app is a strictly smaller capability than seeing it,
// so this can't grant access to data the caller couldn't already reach.
//
// `redact_opponents` (default true, per plan §2.2's schema): breakdowns
// carry no per-match "opponent" field at all — the only place a real
// third party's name can appear as the *subject* of a share is when
// `type: 'profile'` and `subject_id` is an `external_person` (someone a
// coach/athlete tagged from scouting footage, who never consented to
// being publicly named) — or, for `type: 'breakdown'`, when that
// breakdown's own focus is an external_person. redact_opponents controls
// whether the public share page/image shows that person's real
// `display_name` or a generic label. It has no effect when the subject is
// the caller's own member profile/breakdown, since there's nothing to
// redact there. See /share/[token]'s resolution route for where this is
// actually applied — flagged prominently for this stage's security review
// (the app's first public-facing surface) since this interpretation isn't
// spelled out by the schema itself, only inferred from what data exists.
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();

    if (input.type === "profile") {
      const isSelf = input.subject_id === context.memberId;
      if (!isSelf) {
        const [{ data: member }, { data: externalPerson }] = await Promise.all([
          supabase.from("members").select("id").eq("id", input.subject_id).maybeSingle(),
          supabase.from("external_people").select("id").eq("id", input.subject_id).maybeSingle(),
        ]);
        if (!member && !externalPerson) {
          return apiError(403, "FORBIDDEN", "You can't share that profile.");
        }
      }
    } else {
      const { data: breakdown } = await supabase
        .from("breakdowns")
        .select("id")
        .eq("id", input.subject_id)
        .maybeSingle();
      if (!breakdown) {
        return apiError(403, "FORBIDDEN", "You can't share that breakdown.");
      }
    }

    const rawToken = generateShareToken();
    const tokenHash = hashShareToken(rawToken);

    const { data: shareLink, error: insertError } = await supabase
      .from("share_links")
      .insert({
        gym_id: context.gymId,
        type: input.type,
        subject_id: input.subject_id,
        token_hash: tokenHash,
        created_by: context.userId,
        redact_opponents: input.redact_opponents,
      })
      .select("id")
      .single();

    if (insertError || !shareLink) {
      console.error("[share-links] failed to create share link", insertError);
      return apiError(
        500,
        "CREATE_FAILED",
        "Something went wrong — the share link wasn't created.",
      );
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "share_link.created",
      entityType: "share_links",
      entityId: shareLink.id,
      afterState: { type: input.type, redact_opponents: input.redact_opponents },
      initiatedBy: context.role === "athlete" ? "self_service" : "coach_manual",
    });

    return NextResponse.json({ success: true, id: shareLink.id, token: rawToken }, { status: 201 });
  },
  { schema: createShareLinkSchema },
);

// GET /api/share-links — the caller's own share links, for a management
// list (see/revoke what you've shared). RLS (share_links_all_own) already
// scopes this to created_by = self; no additional filtering needed here.
export const GET = withAuth(async (_request, context) => {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("share_links")
    .select("id, type, subject_id, redact_opponents, revoked, created_at")
    .eq("created_by", context.userId)
    .order("created_at", { ascending: false });

  if (error) {
    return apiError(500, "INTERNAL_ERROR", "Something went wrong.");
  }

  return NextResponse.json({ shareLinks: data });
});
