import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hashInviteToken, MAX_INVITE_ATTEMPTS } from "@/lib/auth/invite-token";

// GET /api/invite/[token] — public, unauthenticated (the invitee has no
// session yet). The hashed-token match against invites.token_hash is the
// only authorization here; returns just enough to render the claim page,
// never the full member row.
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  const tokenHash = hashInviteToken(params.token);
  const supabase = createServiceRoleClient();

  const { data: invite, error } = await supabase
    .from("invites")
    .select("claimed_at, expires_at, attempt_count, members(first_name, gyms(name))")
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

  return NextResponse.json({
    memberFirstName: invite.members?.first_name ?? null,
    gymName: invite.members?.gyms?.name ?? null,
  });
}
