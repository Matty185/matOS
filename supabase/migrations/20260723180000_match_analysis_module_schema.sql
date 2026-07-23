-- Match Analysis Module — Stage A1: schema (5 tables) + RLS + event_types/
-- positions seed. Companion spec: matos_analysis_module_plan.md §5 (Data
-- Model), §7 (Permissions & RLS); non-negotiables in CLAUDE.md's "Match
-- Analysis Module" section. BLOCKING on security-reviewer +
-- database-reviewer per both documents, same as alpha Stage 1.
--
-- Design notes:
--
-- 1. `breakdowns.gym_id` is derived from whichever of member_id/
--    external_person_id is set (a CHECK constraint enforces exactly one is
--    non-null), not trusted as client input — same "never trust client
--    gym_id" posture as every other member-linked table, extended here to
--    handle the dual-source focus-athlete model (Non-Negotiable #2).
-- 2. `breakdown_positions.gym_id` / `breakdown_events.gym_id` are derived
--    from `breakdown_id`, mirroring the member_id-derivation pattern used
--    throughout this schema (e.g. belt_history, payments).
-- 3. `breakdown_events.modifier`/`outcome` are validated server-side (a
--    BEFORE INSERT/UPDATE trigger) against the referenced event_types row's
--    modifier_options/modifier_required/outcome_required/outcome_options —
--    Non-Negotiable #4. Not a CHECK constraint: the valid-values set is
--    data (event_types rows), not a fixed set a CHECK could pin at
--    constraint-creation time without becoming schema again.
-- 4. `positions` is a reference/seed table (same shape as event_types),
--    not a Postgres enum — plan §5 writes `breakdown_positions.position`
--    as "enum/ref" without deciding. A table was chosen here for the same
--    coach-editability event_types gets (Non-Negotiable #3's spirit
--    extended to positions, not just events) — flagged explicitly for
--    database-reviewer to confirm or override; no strong preference given
--    on this one.
-- 5. Deletion cascades from breakdowns to breakdown_positions/
--    breakdown_events (ON DELETE CASCADE) per Non-Negotiable #8 — a
--    deliberate, narrow exception to CLAUDE.md Rule 6 ("deletes are mostly
--    disabled"): this is the author's own draft-like tagging artifact, not
--    a business record like a payment or audit entry.
-- 6. Wiring the GDPR deletion-execute route to also purge member-linked
--    breakdowns (Non-Negotiable #10) is intentionally NOT done in this
--    migration — Stage A1 is schema + RLS + seed only, matching "same as
--    alpha Stage 1" in both companion documents; that route change is
--    application code, deferred to whichever stage first builds breakdown
--    CRUD routes (tracked, not forgotten — flagged again in the stage
--    report).
-- 7. Seed data below is transcribed directly from
--    supabase/seed-data/analysis-taxonomy.ts (Stage A0), including that
--    file's own locked provisional choices (sweep_attempt's modifier set,
--    the expanded submission-type list). That TS file predates this
--    schema by design and has no ongoing sync obligation once these rows
--    exist — per Non-Negotiable #3, future taxonomy edits (coach review)
--    land as new data migrations directly against these tables, not by
--    editing and re-transcribing the TS file.

-- ── Enums ─────────────────────────────────────────────────────────────────

create type public.breakdown_status as enum ('in_progress', 'complete');
create type public.breakdown_result as enum ('win', 'loss', 'draw');
create type public.breakdown_method as enum ('submission', 'points', 'decision', 'dq');
create type public.breakdown_event_source as enum ('manual', 'ai');

-- ── external_people ──────────────────────────────────────────────────────
-- Gym-scoped analyst records (opponents/anyone), free-named, unlinked to
-- accounts. No member relationship to derive gym_id from, so it's trusted
-- from server-injected context at the app layer, same as every gym-level
-- (not member-level) table already in this schema (e.g. classes).

create table public.external_people (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  created_by uuid references auth.users (id) on delete set null,
  display_name text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index external_people_gym_id_idx on public.external_people (gym_id);
create index external_people_created_by_idx on public.external_people (created_by);

-- ── positions (reference/seed data — see design note 4) ───────────────────

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  roles jsonb,
  notes text,
  active boolean not null default true
);

-- ── event_types (reference/seed data — plan §5) ───────────────────────────

create table public.event_types (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null unique,
  modifier_options jsonb,
  modifier_required boolean not null default false,
  outcome_required boolean not null default false,
  outcome_options jsonb,
  active boolean not null default true
);

-- ── breakdowns ──────────────────────────────────────────────────────────────

create table public.breakdowns (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  author_id uuid not null references auth.users (id) on delete restrict,
  member_id uuid references public.members (id) on delete restrict,
  external_person_id uuid references public.external_people (id) on delete restrict,
  name text not null,
  match_date date not null,
  gi boolean not null,
  result public.breakdown_result,
  method public.breakdown_method,
  duration_seconds numeric check (duration_seconds > 0),
  video_filename text,
  video_duration_seconds numeric check (video_duration_seconds > 0),
  status public.breakdown_status not null default 'in_progress',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint breakdowns_exactly_one_focus check (
    (member_id is not null and external_person_id is null)
    or (member_id is null and external_person_id is not null)
  )
);

create index breakdowns_gym_id_idx on public.breakdowns (gym_id);
create index breakdowns_author_id_idx on public.breakdowns (author_id);
create index breakdowns_member_id_idx on public.breakdowns (member_id);
create index breakdowns_external_person_id_idx on public.breakdowns (external_person_id);

-- ── breakdown_positions ───────────────────────────────────────────────────

create table public.breakdown_positions (
  id uuid primary key default gen_random_uuid(),
  breakdown_id uuid not null references public.breakdowns (id) on delete cascade,
  gym_id uuid not null references public.gyms (id) on delete restrict,
  position_id uuid not null references public.positions (id) on delete restrict,
  role text,
  start_ts numeric not null check (start_ts >= 0),
  end_ts numeric check (end_ts >= 0),
  constraint breakdown_positions_end_after_start check (end_ts is null or end_ts >= start_ts)
);

create index breakdown_positions_breakdown_id_idx on public.breakdown_positions (breakdown_id);
create index breakdown_positions_gym_id_idx on public.breakdown_positions (gym_id);

-- ── breakdown_events ──────────────────────────────────────────────────────

create table public.breakdown_events (
  id uuid primary key default gen_random_uuid(),
  breakdown_id uuid not null references public.breakdowns (id) on delete cascade,
  gym_id uuid not null references public.gyms (id) on delete restrict,
  event_type_id uuid not null references public.event_types (id) on delete restrict,
  modifier text,
  outcome text,
  ts numeric not null check (ts >= 0),
  source public.breakdown_event_source not null default 'manual',
  created_at timestamptz not null default now()
);

create index breakdown_events_breakdown_id_idx on public.breakdown_events (breakdown_id);
create index breakdown_events_gym_id_idx on public.breakdown_events (gym_id);
create index breakdown_events_event_type_id_idx on public.breakdown_events (event_type_id);

-- ── Triggers: gym_id derivation ───────────────────────────────────────────

create or replace function public.derive_gym_id_from_breakdown_focus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  focus_gym_id uuid;
begin
  if new.member_id is not null then
    select gym_id into focus_gym_id from public.members where id = new.member_id;
  else
    select gym_id into focus_gym_id from public.external_people where id = new.external_person_id;
  end if;
  if focus_gym_id is null then
    raise exception 'member_id or external_person_id does not reference an existing record';
  end if;
  new.gym_id = focus_gym_id;
  return new;
end;
$$;

create trigger breakdowns_derive_gym_id
  before insert or update on public.breakdowns
  for each row execute function public.derive_gym_id_from_breakdown_focus();

create trigger breakdowns_set_updated_at
  before update on public.breakdowns
  for each row execute function public.set_updated_at();

create or replace function public.derive_gym_id_from_breakdown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_gym_id uuid;
begin
  select gym_id into parent_gym_id from public.breakdowns where id = new.breakdown_id;
  if parent_gym_id is null then
    raise exception 'breakdown_id does not reference an existing breakdown';
  end if;
  new.gym_id = parent_gym_id;
  return new;
end;
$$;

create trigger breakdown_positions_derive_gym_id
  before insert or update on public.breakdown_positions
  for each row execute function public.derive_gym_id_from_breakdown();

create trigger breakdown_events_derive_gym_id
  before insert or update on public.breakdown_events
  for each row execute function public.derive_gym_id_from_breakdown();

-- ── Trigger: breakdown_events modifier/outcome validation (Non-Negotiable #4) ──

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

  if new.outcome is not null and et.outcome_options is not null and not (et.outcome_options ? new.outcome) then
    raise exception 'outcome % is not valid for event type %', new.outcome, et.name;
  end if;

  if et.outcome_required and new.outcome is null then
    raise exception 'outcome is required for event type %', et.name;
  end if;

  if new.modifier is not null and et.modifier_options is not null and not (et.modifier_options ? new.modifier) then
    raise exception 'modifier % is not valid for event type %', new.modifier, et.name;
  end if;

  if et.modifier_required and new.modifier is null then
    raise exception 'modifier is required for event type %', et.name;
  end if;

  return new;
end;
$$;

create trigger breakdown_events_validate
  before insert or update on public.breakdown_events
  for each row execute function public.validate_breakdown_event();

-- ── RLS: enable everywhere ─────────────────────────────────────────────────

alter table public.external_people enable row level security;
alter table public.positions enable row level security;
alter table public.event_types enable row level security;
alter table public.breakdowns enable row level security;
alter table public.breakdown_positions enable row level security;
alter table public.breakdown_events enable row level security;

-- ── external_people ────────────────────────────────────────────────────────
-- Coach/owner: full CRUD in gym. Athlete: CRUD own (created_by) — plan §7.

create policy external_people_all_staff on public.external_people
  for all to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy external_people_all_self on public.external_people
  for all to authenticated
  using (created_by = (select auth.uid()) and gym_id = (select private.my_gym_id()))
  with check (created_by = (select auth.uid()) and gym_id = (select private.my_gym_id()));

-- ── positions / event_types ────────────────────────────────────────────────
-- Reference data: readable by every authenticated user (not gym-scoped —
-- shared taxonomy), writable only by service role (seed/coach-review data
-- migrations) — plan §7's "SELECT all; writes: service role/seed only"
-- for event_types, extended identically to positions.

create policy positions_select_all on public.positions
  for select to authenticated
  using (true);

create policy event_types_select_all on public.event_types
  for select to authenticated
  using (true);

-- ── breakdowns ──────────────────────────────────────────────────────────────
-- Coach/owner: SELECT all in gym; CRUD own-authored, may author for any
-- member (no focus restriction). Athlete: CRUD own-authored, focus
-- restricted to self or their own external_people — plan §7. Collapsed
-- into one "own-authored" policy rather than separate staff/self ones:
-- the only real difference between them is whether the focus restriction
-- applies, which reads more clearly as one OR'd condition than duplicated
-- policies.

create policy breakdowns_select_staff on public.breakdowns
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy breakdowns_all_own on public.breakdowns
  for all to authenticated
  using (author_id = (select auth.uid()) and gym_id = (select private.my_gym_id()))
  with check (
    author_id = (select auth.uid())
    and gym_id = (select private.my_gym_id())
    and (
      (select private.is_coach_or_owner())
      or member_id = (select private.my_member_id())
      or external_person_id in (select id from public.external_people where created_by = (select auth.uid()))
    )
  );

-- ── breakdown_positions / breakdown_events ("follow parent breakdown") ─────
-- Staff: broad SELECT for anything in gym (matches breakdowns_select_staff).
-- Write access (insert/update/delete) is author-scoped on the PARENT
-- breakdown for everyone, staff included — plan §7 doesn't grant staff
-- broader write access to positions/events than they have on the
-- breakdown itself ("CRUD own-authored" is staff's write scope too).

create policy breakdown_positions_select_staff on public.breakdown_positions
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy breakdown_positions_all_author on public.breakdown_positions
  for all to authenticated
  using (
    gym_id = (select private.my_gym_id())
    and exists (select 1 from public.breakdowns b where b.id = breakdown_id and b.author_id = (select auth.uid()))
  )
  with check (
    gym_id = (select private.my_gym_id())
    and exists (select 1 from public.breakdowns b where b.id = breakdown_id and b.author_id = (select auth.uid()))
  );

create policy breakdown_events_select_staff on public.breakdown_events
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy breakdown_events_all_author on public.breakdown_events
  for all to authenticated
  using (
    gym_id = (select private.my_gym_id())
    and exists (select 1 from public.breakdowns b where b.id = breakdown_id and b.author_id = (select auth.uid()))
  )
  with check (
    gym_id = (select private.my_gym_id())
    and exists (select 1 from public.breakdowns b where b.id = breakdown_id and b.author_id = (select auth.uid()))
  );

-- ── Seed: positions (transcribed from supabase/seed-data/analysis-taxonomy.ts) ──

insert into public.positions (name, roles, notes) values
  ('standing_neutral', null, null),
  ('closed_guard', '["playing", "inside"]', null),
  ('half_guard', '["bottom", "top"]', null),
  ('open_guard', '["playing", "passing"]', null),
  ('side_control', '["top", "bottom"]', null),
  ('mount', '["top", "bottom"]', null),
  ('back_control', '["has_back", "back_taken"]', null),
  ('turtle', '["top", "turtled"]', null),
  ('leg_entanglement', '["attacking", "defending"]', null),
  ('scramble', null, 'resolution = next tagged position');

-- ── Seed: event_types (transcribed from supabase/seed-data/analysis-taxonomy.ts) ──

insert into public.event_types (category, name, modifier_options, modifier_required, outcome_required, outcome_options) values
  ('standing_wrestling', 'takedown_attempt', '["single", "double", "throw", "trip", "other"]', false, true, '["completed", "defended", "scramble"]'),
  ('standing_wrestling', 'takedown_defended', null, false, true, '["stuffed", "conceded", "scramble"]'),
  ('standing_wrestling', 'guard_pull', null, false, false, '["to_closed", "to_half", "to_open"]'),
  ('standing_wrestling', 'underhook_won', null, false, false, null),
  ('standing_wrestling', 'underhook_lost', null, false, false, null),
  ('guard_bottom', 'sweep_attempt', '["scissor", "pendulum", "hip_bump", "butterfly", "elevator", "berimbolo", "other"]', false, true, '["completed", "defended"]'),
  ('guard_bottom', 'guard_retention', null, false, true, '["retained", "passed"]'),
  ('guard_bottom', 'wrestle_up_attempt', null, false, true, '["completed", "defended"]'),
  ('top', 'guard_pass_attempt', '["pressure", "speed", "leg_drag", "other"]', false, true, '["completed", "defended"]'),
  ('attack_defence', 'submission_attempt', '["armbar", "triangle", "rnc", "guillotine", "heel_hook", "kimura", "americana", "omoplata", "kneebar", "ankle_lock", "darce", "anaconda", "ezekiel", "gogoplata", "other"]', true, true, '["finished", "defended", "lost_position"]'),
  ('attack_defence', 'submission_defended', '["armbar", "triangle", "rnc", "guillotine", "heel_hook", "kimura", "americana", "omoplata", "kneebar", "ankle_lock", "darce", "anaconda", "ezekiel", "gogoplata", "other"]', false, true, '["escaped", "tapped"]'),
  ('attack_defence', 'escape', null, false, true, '["completed", "failed"]'),
  ('attack_defence', 'reversal', null, false, false, null),
  ('attack_defence', 'back_take', null, false, false, null),
  ('misc', 'reset_out_of_bounds', null, false, false, null);
