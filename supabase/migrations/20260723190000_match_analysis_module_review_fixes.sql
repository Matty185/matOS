-- Match Analysis Module — Stage A1 review-gate fixes.
--
-- security-reviewer found 1 BLOCKED + 4 FLAGGED; database-reviewer found
-- 2 BLOCKED + 3 FLAGGED against 20260723180000_match_analysis_module_schema.sql
-- (two of the BLOCKED items are the same finding from both agents, escalated
-- from FLAGGED to BLOCKED by database-reviewer's live-probe confirmation).
-- This migration resolves everything that blocks per CLAUDE.md ("never
-- proceed past a security or critic BLOCKED item") plus the FLAGGED items
-- cheap enough to fix immediately rather than defer. New migration file,
-- not an edit to the applied one, per CLAUDE.md's migration convention.
--
-- BLOCKED, fixed here:
-- 1. (security) breakdowns.author_id was `not null ... on delete restrict`
--    — reproduces the exact bug schema_core.sql's design note 6 already
--    found and fixed once for belt_history.promoted_by: any coach who has
--    ever authored a breakdown for any member becomes permanently
--    undeletable via the GDPR flow. Every other auth.users FK in this
--    schema uses `on delete set null`; this one now matches.
-- 2. (security FLAGGED, database BLOCKED via live probe) validate_breakdown_event
--    silently accepted arbitrary modifier/outcome values whenever
--    event_types.modifier_options/outcome_options was NULL, instead of
--    treating NULL as "zero valid values, field must stay NULL" — the
--    taxonomy's own documented semantics (analysis-taxonomy.ts: "null =
--    event has no modifier at all"). Now enforced both ways.
-- 3. (security FLAGGED, database BLOCKED — complete absence, not partial)
--    breakdown_positions.role had zero server-side validation against
--    positions.roles at all. New validate_breakdown_position trigger,
--    mirroring the events pattern.
--
-- FLAGGED, fixed here (cheap, high-value, no reason to defer):
-- 4. (security) No explicit TRUNCATE revoke for the 6 new tables — this
--    codebase already found a real cross-tenant-data-loss vector here once
--    (rls_and_functions.sql's own comment: Supabase's default privileges
--    grant TRUNCATE, which bypasses RLS and triggers entirely) and the fix
--    there explicitly notes its ALTER DEFAULT PRIVILEGES protection isn't
--    independently re-verified per migration. Asserted explicitly here as
--    defense-in-depth rather than assumed inherited.
-- 5. (security) breakdowns_all_own's USING clause omitted the focus
--    restriction WITH CHECK enforces — narrow gap (a coach demoted to
--    athlete after authoring breakdowns for other members would retain
--    SELECT/DELETE on those rows, a Rule 3 violation) but cheap to close.
-- 6. (database) No safeguard against multiple simultaneously-open position
--    intervals per breakdown (two-plus rows with end_ts null) — the "next
--    position tag closes the previous interval" guarantee was
--    application-layer only. A partial unique index turns a silent
--    trajectory-corruption risk (real given the plan's own "resume warns
--    on mismatch but allows proceeding" flow) into an immediate
--    constraint violation.
-- 7. (database) Documents, on the trigger objects themselves, that
--    breakdown_events_derive_gym_id / breakdown_events_validate have no
--    ordering dependency (verified true by both reviewers) — so a future
--    editor adding a gym_id-dependent check to one function doesn't have
--    to re-derive that Postgres only guarantees alphabetical-by-name
--    ordering among same-timing triggers, not anything stronger.
--
-- Explicitly NOT changed here (reviewers' own assessment, not oversights):
-- - `positions` stays a reference table, not a Postgres enum
--   (database-reviewer: "confirm the reference-table choice — don't switch
--   to an enum"; the actual gap was the missing validation trigger, fixed
--   above as item 3).
-- - No composite index for member_id/gi/match_date profile queries yet —
--   database-reviewer confirmed this is "correctly deferred per the plan's
--   own §11" (Stage A5 decides live-query-vs-materialised-view together).
-- - numeric vs. the plan's "float" wording for timestamp columns — cosmetic,
--   numeric is a strict superset, no functional gap.

-- ── Fix 1: breakdowns.author_id — allow orphaning, don't block user deletion ──

alter table public.breakdowns alter column author_id drop not null;
alter table public.breakdowns drop constraint breakdowns_author_id_fkey;
alter table public.breakdowns
  add constraint breakdowns_author_id_fkey
  foreign key (author_id) references auth.users (id) on delete set null;

-- ── Fix 2: validate_breakdown_event — NULL options means "must stay NULL" ────

create or replace function public.validate_breakdown_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  et public.event_types%rowtype;
begin
  select * into et from public.event_types where id = new.event_type_id;
  if et.id is null then
    raise exception 'event_type_id does not reference an existing event type';
  end if;

  if et.outcome_options is null then
    if new.outcome is not null then
      raise exception 'event type % has no valid outcomes; outcome must be null', et.name;
    end if;
  elsif new.outcome is not null and not (et.outcome_options ? new.outcome) then
    raise exception 'outcome % is not valid for event type %', new.outcome, et.name;
  end if;

  if et.outcome_required and new.outcome is null then
    raise exception 'outcome is required for event type %', et.name;
  end if;

  if et.modifier_options is null then
    if new.modifier is not null then
      raise exception 'event type % has no valid modifiers; modifier must be null', et.name;
    end if;
  elsif new.modifier is not null and not (et.modifier_options ? new.modifier) then
    raise exception 'modifier % is not valid for event type %', new.modifier, et.name;
  end if;

  if et.modifier_required and new.modifier is null then
    raise exception 'modifier is required for event type %', et.name;
  end if;

  return new;
end;
$$;

comment on trigger breakdown_events_derive_gym_id on public.breakdown_events is
  'BEFORE trigger, fires alongside breakdown_events_validate. No ordering dependency between the two exists today (validate reads only event_type_id/modifier/outcome, never gym_id) — Postgres only guarantees alphabetical-by-name ordering among same-timing triggers, so re-verify this if either function is ever changed to read a column the other one sets.';

comment on trigger breakdown_events_validate on public.breakdown_events is
  'BEFORE trigger, fires alongside breakdown_events_derive_gym_id. See that trigger''s comment for the ordering-independence note.';

-- ── Fix 3: validate_breakdown_position — new, mirrors the events pattern ────

create or replace function public.validate_breakdown_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pos public.positions%rowtype;
begin
  select * into pos from public.positions where id = new.position_id;
  if pos.id is null then
    raise exception 'position_id does not reference an existing position';
  end if;

  if new.role is not null then
    if pos.roles is null then
      raise exception 'position % has no valid roles; role must be null', pos.name;
    elsif not (pos.roles ? new.role) then
      raise exception 'role % is not valid for position %', new.role, pos.name;
    end if;
  end if;

  return new;
end;
$$;

create trigger breakdown_positions_validate
  before insert or update on public.breakdown_positions
  for each row execute function public.validate_breakdown_position();

-- ── Fix 4: explicit TRUNCATE revoke, defense-in-depth ──────────────────────

revoke truncate on
  public.external_people,
  public.positions,
  public.event_types,
  public.breakdowns,
  public.breakdown_positions,
  public.breakdown_events
from authenticated, anon;

-- ── Fix 5: breakdowns_all_own — mirror the focus restriction into USING ────

alter policy breakdowns_all_own on public.breakdowns
  using (
    author_id = (select auth.uid())
    and gym_id = (select private.my_gym_id())
    and (
      (select private.is_coach_or_owner())
      or member_id = (select private.my_member_id())
      or external_person_id in (select id from public.external_people where created_by = (select auth.uid()))
    )
  );

-- ── Fix 6: prevent multiple simultaneously-open position intervals ─────────

create unique index breakdown_positions_one_open_interval_idx
  on public.breakdown_positions (breakdown_id)
  where end_ts is null;
