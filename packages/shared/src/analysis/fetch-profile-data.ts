import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import {
  computeAthleteProfile,
  type AthleteProfile,
  type BreakdownForProfile,
  type EventForProfile,
  type PositionForProfile,
} from "./profile";

export type ProfileSubject = { type: "member"; id: string } | { type: "external"; id: string };

export type FetchAthleteProfileDataOptions = {
  // Stage S3 (security-reviewer finding, BLOCKED before fix): this
  // function's whole safety contract — see the paragraph below — is that
  // RLS, not the function itself, scopes visible rows. That contract
  // silently broke the moment a caller with a *non*-RLS-respecting client
  // showed up: the public share-link resolution path
  // (lib/share/resolve-share-link.ts) uses a service-role client (no
  // session exists on a public, unauthenticated page), which bypasses RLS
  // entirely — without this option, a public profile share would have
  // aggregated every complete breakdown with that focus from *any* gym,
  // any author, any visibility, including breakdowns marked `private`
  // that not even the breakdown's own subject or other gym staff can see
  // in-app. Setting this to true reproduces the one part of the RLS
  // policy combination that matters for a public, no-session context —
  // `visibility = 'gym'` — without touching behaviour for the existing,
  // already-reviewed authenticated call sites (use-athlete-profile.ts,
  // read-tools.ts), which must keep working exactly as before (an
  // athlete's own RLS-scoped view already correctly includes their own
  // authored breakdowns regardless of visibility; hard-filtering here
  // unconditionally would have wrongly excluded those).
  publicVisibilityOnly?: boolean;
};

// Extracted from use-athlete-profile.ts (Stage A5) at Stage A7 so the
// agent's server-side get_athlete_profile/get_metric/compare_profiles
// tools can reuse the exact same query shape instead of duplicating it —
// both the browser client (use-athlete-profile.ts) and the server client
// (read-tools.ts, inside withAuth) implement the same query-builder
// interface, so this function is agnostic to which one it's handed. RLS —
// not this function — is what scopes the returned rows to whatever the
// caller's session can see (plan §7: a coach sees every breakdown in the
// gym; an athlete only ever sees breakdowns they authored themselves, so
// an athlete's "own profile" reflects self-authored breakdowns about
// themselves, not every breakdown any coach ever logged about them — the
// existing, already-reviewed A1 authorization model, unchanged here).
// That contract requires an RLS-respecting client — see
// FetchAthleteProfileDataOptions.publicVisibilityOnly for the one caller
// that can't provide one.
export async function fetchAthleteProfileData(
  supabase: SupabaseClient<Database>,
  subject: ProfileSubject,
  options: FetchAthleteProfileDataOptions = {},
): Promise<{ gi: AthleteProfile; noGi: AthleteProfile }> {
  const focusColumn = subject.type === "member" ? "member_id" : "external_person_id";

  // Stage A5 review (database + code): an in_progress breakdown counts
  // whatever's been tagged so far as if it were the final record — real,
  // still-being-corrected numbers presented with the same confidence as a
  // finished match. Plan §6 frames profile recompute as happening on
  // "Finish: mark complete", so complete-only is the considered choice
  // here, not an oversight. Non-Negotiable #6's "shown from n=1" is about
  // not hiding low-sample metrics, not about counting unfinished ones —
  // the two aren't in tension.
  let breakdownsQuery = supabase
    .from("breakdowns")
    .select("id, gi, match_date, duration_seconds, result, method")
    .eq(focusColumn, subject.id)
    .eq("status", "complete");
  if (options.publicVisibilityOnly) {
    breakdownsQuery = breakdownsQuery.eq("visibility", "gym");
  }
  const { data: breakdownRows, error: breakdownError } = await breakdownsQuery;
  if (breakdownError) throw breakdownError;

  const breakdownIds = (breakdownRows ?? []).map((b) => b.id);

  // No .range()/pagination — fine at alpha scale, but PostgREST's max_rows
  // (supabase/config.toml, currently 1000) is a hard per-request cap: once
  // a single athlete's cumulative positions+events rows approach that,
  // these .in() queries will silently truncate with no error, producing a
  // wrong (partial) profile. Revisit then — paginate via .range() +
  // accumulate, or move to a server-side RPC/materialised view (flagged to
  // database-reviewer at Stage A5's gate; plain JS aggregation was the
  // agreed call for now).
  const [{ data: positionRows, error: positionError }, { data: eventRows, error: eventError }] =
    breakdownIds.length === 0
      ? [{ data: [], error: null } as const, { data: [], error: null } as const]
      : await Promise.all([
          supabase
            .from("breakdown_positions")
            .select("breakdown_id, start_ts, end_ts, role, positions(name)")
            .in("breakdown_id", breakdownIds),
          supabase
            .from("breakdown_events")
            .select("breakdown_id, ts, modifier, outcome, event_types(name)")
            .in("breakdown_id", breakdownIds),
        ]);
  if (positionError) throw positionError;
  if (eventError) throw eventError;

  const positionsByGi = new Map<boolean, PositionForProfile[]>([
    [true, []],
    [false, []],
  ]);
  const eventsByGi = new Map<boolean, EventForProfile[]>([
    [true, []],
    [false, []],
  ]);
  const breakdownsByGi = new Map<boolean, BreakdownForProfile[]>([
    [true, []],
    [false, []],
  ]);
  const giByBreakdownId = new Map<string, boolean>();

  for (const b of breakdownRows ?? []) {
    giByBreakdownId.set(b.id, b.gi);
    breakdownsByGi.get(b.gi)?.push({
      id: b.id,
      match_date: b.match_date,
      duration_seconds: b.duration_seconds,
      result: b.result,
      method: b.method,
    });
  }
  for (const p of (positionRows ?? []) as unknown as {
    breakdown_id: string;
    start_ts: number;
    end_ts: number | null;
    role: string | null;
    positions: { name: string } | null;
  }[]) {
    const gi = giByBreakdownId.get(p.breakdown_id);
    if (gi === undefined || !p.positions) continue;
    positionsByGi.get(gi)?.push({
      breakdown_id: p.breakdown_id,
      position_name: p.positions.name,
      role: p.role,
      start_ts: p.start_ts,
      end_ts: p.end_ts,
    });
  }
  for (const e of (eventRows ?? []) as unknown as {
    breakdown_id: string;
    ts: number;
    modifier: string | null;
    outcome: string | null;
    event_types: { name: string } | null;
  }[]) {
    const gi = giByBreakdownId.get(e.breakdown_id);
    if (gi === undefined || !e.event_types) continue;
    eventsByGi.get(gi)?.push({
      breakdown_id: e.breakdown_id,
      event_name: e.event_types.name,
      modifier: e.modifier,
      outcome: e.outcome,
      ts: e.ts,
    });
  }

  return {
    gi: computeAthleteProfile(
      breakdownsByGi.get(true) ?? [],
      positionsByGi.get(true) ?? [],
      eventsByGi.get(true) ?? [],
    ),
    noGi: computeAthleteProfile(
      breakdownsByGi.get(false) ?? [],
      positionsByGi.get(false) ?? [],
      eventsByGi.get(false) ?? [],
    ),
  };
}
