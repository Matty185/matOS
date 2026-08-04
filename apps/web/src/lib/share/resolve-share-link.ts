import "server-only";
import { unstable_noStore as noStore } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hashShareToken } from "@/lib/auth/share-token";
import { fetchAthleteProfileData, type AthleteProfile, type Database } from "@matos/shared";

type BeltColor = Database["public"]["Enums"]["belt_color"];

// Stage S3: the only place a share token gets resolved — public,
// unauthenticated, service-role (no public RLS policy exists on
// share_links or the tables it points at, deliberately, per the S1
// design note: "never a blanket public policy on underlying tables").
// Mirrors the already-reviewed invite GET route's exact pattern (hashed
// token lookup via service-role, return only a sanitised projection) —
// the established, already-security-reviewed precedent for public token
// resolution in this codebase, rather than a new mechanism.
//
// SECURITY (fixed before this gate passed, not an assumption): using a
// service-role client bypasses RLS entirely, and fetchAthleteProfileData()
// was written on the explicit assumption that RLS — not the function
// itself — scopes which breakdowns get aggregated. The first draft of
// this file called it with the raw service-role client, which meant a
// public profile share would have aggregated *every* complete breakdown
// with that focus regardless of `visibility` — including `private`
// breakdowns not even the breakdown's own subject or other gym staff can
// see in-app. Both calls below pass `{ publicVisibilityOnly: true }`,
// which adds an explicit `visibility = 'gym'` filter at this one call
// site only — see fetch-profile-data.ts's own comment for why this can't
// be the function's unconditional default (it would wrongly break the
// existing, already-reviewed authenticated profile view, which correctly
// includes a user's own authored breakdowns regardless of visibility).
//
// A generic placeholder replaces a real external_person's name whenever
// redact_opponents is true and the subject resolves to one — see
// api/share-links/route.ts's comment for why this, not "opponent name in
// a match," is what redact_opponents actually has to redact given the
// current schema.
//
// noStore() (called first thing in resolveShareLink, below) is not
// optional: found live, while re-verifying the visibility fix above —
// even with the page's own `export const dynamic = "force-dynamic"`,
// Supabase-js's underlying REST fetch calls made from here were still
// being served from Next's request/data cache, so a page that had
// already been rendered once kept showing stale data (a newly-created
// `visibility: 'gym'` breakdown didn't appear until this was added).
// `unstable_noStore()` is Next's documented, more granular escape hatch
// for exactly this — call it inside the data-fetching function itself,
// not just at the route-segment level — and a public, revocation-gated,
// no-session page is precisely the case that can never tolerate stale
// reads: a revoked link, or a visibility change, must take effect on the
// very next request.
const REDACTED_NAME = "Training Partner";

export type ResolvedProfileShare = {
  kind: "profile";
  displayName: string;
  belt: BeltColor | null;
  stripes: number | null;
  redacted: boolean;
  gi: AthleteProfile;
  noGi: AthleteProfile;
};

export type ResolvedBreakdownShare = {
  kind: "breakdown";
  name: string;
  matchDate: string;
  gi: boolean;
  result: "win" | "loss" | "draw" | null;
  method: "submission" | "points" | "decision" | "dq" | null;
  focusDisplayName: string;
  redacted: boolean;
};

export type ResolvedShare = ResolvedProfileShare | ResolvedBreakdownShare;

export async function resolveShareLink(rawToken: string): Promise<ResolvedShare | null> {
  noStore();
  const supabase = createServiceRoleClient();
  const tokenHash = hashShareToken(rawToken);

  const { data: shareLink, error } = await supabase
    .from("share_links")
    .select("type, subject_id, redact_opponents, revoked")
    .eq("token_hash", tokenHash)
    .single();

  if (error || !shareLink || shareLink.revoked) {
    return null;
  }

  if (shareLink.type === "profile") {
    const { data: member } = await supabase
      .from("members")
      .select("id, first_name, last_name, belt, stripes")
      .eq("id", shareLink.subject_id)
      .maybeSingle();

    if (member) {
      const profile = await fetchAthleteProfileData(
        supabase,
        { type: "member", id: member.id },
        { publicVisibilityOnly: true },
      );
      return {
        kind: "profile",
        displayName: `${member.first_name} ${member.last_name}`,
        belt: member.belt,
        stripes: member.stripes,
        redacted: false,
        gi: profile.gi,
        noGi: profile.noGi,
      };
    }

    const { data: externalPerson } = await supabase
      .from("external_people")
      .select("id, display_name")
      .eq("id", shareLink.subject_id)
      .maybeSingle();

    if (!externalPerson) return null;

    const profile = await fetchAthleteProfileData(
      supabase,
      { type: "external", id: externalPerson.id },
      { publicVisibilityOnly: true },
    );
    return {
      kind: "profile",
      displayName: shareLink.redact_opponents ? REDACTED_NAME : externalPerson.display_name,
      belt: null,
      stripes: null,
      redacted: shareLink.redact_opponents,
      gi: profile.gi,
      noGi: profile.noGi,
    };
  }

  const { data: breakdown } = await supabase
    .from("breakdowns")
    .select(
      "name, match_date, gi, result, method, member_id, external_person_id, members(first_name, last_name), external_people(display_name)",
    )
    .eq("id", shareLink.subject_id)
    .maybeSingle();

  if (!breakdown) return null;

  const isExternalFocus = breakdown.external_person_id !== null;
  const redacted = isExternalFocus && shareLink.redact_opponents;
  const focusDisplayName = redacted
    ? REDACTED_NAME
    : breakdown.members
      ? `${breakdown.members.first_name} ${breakdown.members.last_name}`
      : (breakdown.external_people?.display_name ?? "Unknown");

  return {
    kind: "breakdown",
    name: breakdown.name,
    matchDate: breakdown.match_date,
    gi: breakdown.gi,
    result: breakdown.result,
    method: breakdown.method,
    focusDisplayName,
    redacted,
  };
}

// Stage S3 (code-review finding): a public "card" only has room for one
// style's stats, not a full gi/no-gi split like the authenticated
// ProfileView — this picks whichever has more logged matches. Extracted
// here (not left as an inline ternary at each of the three places that
// used to repeat it, in both page.tsx and opengraph-image.tsx) so the
// tie-break rule only exists once. A tie (including 0 vs 0, someone with
// no logged matches in either style) defaults to gi — arbitrary, but
// deterministic, and the resulting empty card is the same regardless of
// which label it's under.
export function pickPrimaryStyle(share: ResolvedProfileShare): {
  profile: AthleteProfile;
  label: "Gi" | "No-Gi";
} {
  return share.gi.matchCount >= share.noGi.matchCount
    ? { profile: share.gi, label: "Gi" }
    : { profile: share.noGi, label: "No-Gi" };
}
