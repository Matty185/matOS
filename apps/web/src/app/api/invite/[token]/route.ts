import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hashInviteToken, MAX_INVITE_ATTEMPTS } from "@/lib/auth/invite-token";
import { findUserByEmail } from "@/lib/auth/find-user-by-email";

// GET /api/invite/[token] — public, unauthenticated (the invitee has no
// session yet). The hashed-token match against invites.token_hash is the
// only authorization here; returns just enough to render the claim page,
// never the full member row.
//
// `accountExists` (Stage S2): whether the invited email already has an
// auth.users account, so the claim page can render the "attach" form
// (verify existing password) instead of the "set a new password" form
// before the user submits anything. This only discloses account existence
// to someone who already possesses a valid, unclaimed, unexpired invite
// token for that specific email — not a general email-enumeration oracle,
// since the token itself is unguessable (see hashInviteToken) and was only
// ever sent to that address by a coach.
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  const tokenHash = hashInviteToken(params.token);
  const supabase = createServiceRoleClient();

  const { data: invite, error } = await supabase
    .from("invites")
    .select("claimed_at, expires_at, attempt_count, members(first_name, email, gyms(name))")
    .eq("token_hash", tokenHash)
    .single();

  if (error || !invite) {
    return apiError(404, "INVITE_NOT_FOUND", "This invite link isn't valid.");
  }

  if (invite.claimed_at) {
    return apiError(410, "INVITE_ALREADY_CLAIMED", "This invite has already been used.");
  }

  if (invite.attempt_count >= MAX_INVITE_ATTEMPTS) {
    return apiError(
      410,
      "INVITE_LOCKED",
      "This invite has been locked. Ask your coach to resend it.",
    );
  }

  if (new Date(invite.expires_at) < new Date()) {
    return apiError(410, "INVITE_EXPIRED", "This invite has expired. Ask your coach to resend it.");
  }

  const existingUser = invite.members?.email
    ? await findUserByEmail(supabase, invite.members.email)
    : null;

  return NextResponse.json({
    memberFirstName: invite.members?.first_name ?? null,
    gymName: invite.members?.gyms?.name ?? null,
    accountExists: existingUser !== null,
  });
}
