import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { generateInviteToken, hashInviteToken, inviteExpiryDate } from "@/lib/auth/invite-token";
import { sendInviteEmail } from "@/lib/email/invite";
import { writeAuditLogStrict } from "@/lib/audit/log";
import type { InviteDelivery } from "@matos/shared";

type CreateInviteParams = {
  memberId: string;
  memberGymId: string;
  memberFirstName: string;
  memberEmail: string;
  gymName: string;
  actorUserId: string;
  delivery: InviteDelivery;
};

type CreateInviteResult =
  | { ok: true; delivery: "email" }
  | { ok: true; delivery: "link"; claimUrl: string; expiresAt: string }
  | { ok: false; status: number; code: string; message: string };

/**
 * Shared by POST /api/invite (invite/resend/share-link) and POST
 * /api/members (auto-invite on add, when email is enabled) — the call sites
 * shouldn't duplicate token generation, the resend-invalidates-old-token
 * behaviour, or the audit write. Callers own the member-lookup/validation
 * steps before calling this (already-claimed checks, etc.).
 *
 * Stage O2: `delivery: "link"` returns the claim URL to the (staff) caller
 * instead of emailing it, so a coach can hand it over directly. The raw
 * token still never touches the database. This IS a trust change (see the
 * 2026-10-30 Decision Log entry): with email, claiming required the
 * member's inbox; with a link, the coach holding it could claim the
 * account themselves. Accepted for the email-less alpha, and every minted
 * link is audit-logged before it is returned.
 */
export async function createInvite(params: CreateInviteParams): Promise<CreateInviteResult> {
  const serviceRole = createServiceRoleClient();

  // Invalidate any prior unclaimed invite for this member (resend
  // behaviour) rather than deleting it — matches "deletes are mostly
  // disabled," keeps the audit trail of prior invite attempts intact.
  const { error: expireError } = await serviceRole
    .from("invites")
    .update({ expires_at: new Date().toISOString() })
    .eq("member_id", params.memberId)
    .is("claimed_at", null);

  // If the old link can't be expired, don't mint a second live one next to
  // it — "a new link stops the old one working" is a promise the UI makes.
  if (expireError) {
    console.error("[invite] failed to expire prior invites", expireError);
    return {
      ok: false,
      status: 500,
      code: "INVITE_CREATE_FAILED",
      message: "Something went wrong — the invite wasn't created.",
    };
  }

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = inviteExpiryDate();

  const { data: invite, error: insertError } = await serviceRole
    .from("invites")
    .insert({
      member_id: params.memberId,
      gym_id: params.memberGymId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();

  if (insertError || !invite) {
    return {
      ok: false,
      status: 500,
      code: "INVITE_CREATE_FAILED",
      message: "Something went wrong — the invite wasn't created.",
    };
  }

  const claimUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${rawToken}`;

  // Audit before the credential leaves this function. On failure the
  // just-created invite is expired again so no unrecorded link exists.
  const audited = await writeAuditLogStrict({
    gymId: params.memberGymId,
    actorId: params.actorUserId,
    action: "invite.created",
    entityType: "invites",
    entityId: invite.id,
    afterState: { member_id: params.memberId, expires_at: expiresAt, delivery: params.delivery },
    initiatedBy: "coach_manual",
  });
  if (!audited) {
    await serviceRole
      .from("invites")
      .update({ expires_at: new Date().toISOString() })
      .eq("id", invite.id);
    return {
      ok: false,
      status: 500,
      code: "INVITE_CREATE_FAILED",
      message: "Something went wrong — the invite wasn't created.",
    };
  }

  if (params.delivery === "email") {
    try {
      await sendInviteEmail({
        to: params.memberEmail,
        memberFirstName: params.memberFirstName,
        gymName: params.gymName,
        claimUrl,
      });
    } catch (error) {
      console.error("[invite] failed to send invite email", error);
      return {
        ok: false,
        status: 502,
        code: "EMAIL_SEND_FAILED",
        message: "The invite was created but the email couldn't be sent. Share the link instead.",
      };
    }
  }

  return params.delivery === "email"
    ? { ok: true, delivery: "email" }
    : { ok: true, delivery: "link", claimUrl, expiresAt };
}

type BatchMember = { memberId: string; gymId: string };

/**
 * Stage O4: link-delivery invites for many members in three round trips
 * (expire all prior, insert all new, audit all) instead of three per
 * member — a 100-member printable sheet must not risk a serverless timeout
 * that would invalidate old links without ever showing the new ones. Same
 * guarantees as createInvite: old links die, nothing is returned unless
 * every new link is audit-logged (on audit failure the batch is expired).
 */
export async function createInviteLinks(
  members: BatchMember[],
  actorUserId: string,
): Promise<{ ok: true; links: Map<string, string> } | { ok: false }> {
  if (members.length === 0) return { ok: true, links: new Map() };
  const serviceRole = createServiceRoleClient();
  const memberIds = members.map((m) => m.memberId);

  const { error: expireError } = await serviceRole
    .from("invites")
    .update({ expires_at: new Date().toISOString() })
    .in("member_id", memberIds)
    .is("claimed_at", null);
  if (expireError) {
    console.error("[invite] batch: failed to expire prior invites", expireError);
    return { ok: false };
  }

  const expiresAt = inviteExpiryDate();
  const tokens = members.map((m) => ({ ...m, rawToken: generateInviteToken() }));
  const { data: inserted, error: insertError } = await serviceRole
    .from("invites")
    .insert(
      tokens.map((t) => ({
        member_id: t.memberId,
        gym_id: t.gymId,
        token_hash: hashInviteToken(t.rawToken),
        expires_at: expiresAt,
        created_by: actorUserId,
      })),
    )
    .select("id, member_id");
  if (insertError || !inserted) {
    console.error("[invite] batch: failed to insert invites", insertError);
    return { ok: false };
  }

  const audited = await writeAuditLogStrict(
    inserted.map((row) => ({
      gymId: tokens.find((t) => t.memberId === row.member_id)!.gymId,
      actorId: actorUserId,
      action: "invite.created",
      entityType: "invites",
      entityId: row.id,
      afterState: { member_id: row.member_id, expires_at: expiresAt, delivery: "link" },
      initiatedBy: "coach_manual" as const,
    })),
  );
  if (!audited) {
    await serviceRole
      .from("invites")
      .update({ expires_at: new Date().toISOString() })
      .in(
        "id",
        inserted.map((r) => r.id),
      );
    return { ok: false };
  }

  const links = new Map<string, string>();
  for (const t of tokens) {
    links.set(t.memberId, `${process.env.NEXT_PUBLIC_APP_URL}/invite/${t.rawToken}`);
  }
  return { ok: true, links };
}
