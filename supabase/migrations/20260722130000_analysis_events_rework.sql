-- Video-analysis rework: replace the prose-style mock report
-- (summary/detected_techniques/overall_notes) with a hard, timestamped
-- event log, matching an MMA-analytics-style metrics tool rather than a
-- coaching-tips generator. Two paths populate the same event-log shape: an
-- AI stub (unchanged in spirit — still no real video processing, still
-- never stores video) and a fully client-side manual entry path where the
-- video itself is never even transmitted to the server, only the resulting
-- structured events. Both athletes (own profile) and coaches/owners (on
-- behalf of their athletes) can use either path.
--
-- `analyses` gains method/duration_seconds/opponent_name/result/
-- result_method/updated_at and drops `report` (fully replaced, not kept
-- alongside). A new `analysis_events` table holds one row per timestamped
-- event — not a JSONB array on `analyses` — matching how every other
-- historical/event concept in this schema is modelled (attendance,
-- payments, belt_history are all their own table).

-- ── Enums ─────────────────────────────────────────────────────────────────

create type public.analysis_method as enum ('ai_stub', 'manual');
create type public.analysis_result as enum ('win', 'loss', 'draw');
create type public.analysis_result_method as enum ('submission', 'points', 'decision', 'dq', 'other');

create type public.analysis_event_type as enum (
  'wrestling', 'underhook', 'takedown', 'guard_pull', 'sweep',
  'submission_attempt', 'submission', 'escape', 'reversal', 'guard_pass',
  'mount_control', 'back_control', 'side_control', 'half_guard', 'guard_bottom', 'stalling'
);

-- ── analyses: new columns, old report column dropped ────────────────────

alter table public.analyses
  add column method public.analysis_method not null default 'manual',
  add column duration_seconds numeric check (duration_seconds > 0),
  add column opponent_name text,
  add column result public.analysis_result,
  add column result_method public.analysis_result_method,
  add column updated_at timestamptz not null default now();

alter table public.analyses drop column report;

create trigger analyses_set_updated_at
  before update on public.analyses
  for each row execute function public.set_updated_at();

-- ── analysis_events ───────────────────────────────────────────────────────
-- member_id/gym_id are denormalized here (not just reachable via
-- analysis_id) matching this schema's existing preference for direct FKs
-- over join-heavy RLS (e.g. attendance keeps both member_id and class_id).
-- Trigger-derived from analysis_id below, never trusted from the client.

create table public.analysis_events (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete restrict,
  member_id uuid not null references public.members (id) on delete restrict,
  gym_id uuid not null references public.gyms (id) on delete restrict,
  event_type public.analysis_event_type not null,
  timestamp_seconds numeric not null check (timestamp_seconds >= 0),
  duration_seconds numeric check (duration_seconds > 0),
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index analysis_events_analysis_id_idx on public.analysis_events (analysis_id);
create index analysis_events_member_id_idx on public.analysis_events (member_id);
create index analysis_events_gym_id_idx on public.analysis_events (gym_id);

create or replace function public.derive_ids_from_analysis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_member_id uuid;
  parent_gym_id uuid;
begin
  select member_id, gym_id into parent_member_id, parent_gym_id
  from public.analyses where id = new.analysis_id;

  if parent_member_id is null then
    raise exception 'analysis_id does not reference an existing analysis';
  end if;

  new.member_id = parent_member_id;
  new.gym_id = parent_gym_id;
  return new;
end;
$$;

create trigger analysis_events_derive_ids
  before insert or update on public.analysis_events
  for each row execute function public.derive_ids_from_analysis();

alter table public.analysis_events enable row level security;

-- Both self and staff get full CRUD (not staff-read-only like athlete_logs)
-- since coaches log matches for their athletes too, not just review them.
-- Real DELETE is a deliberate, narrow exception to CLAUDE.md Rule 6
-- ("deletes are mostly disabled") — this is draft-like content a user is
-- actively correcting while timestamping a video (misclicks, wrong event
-- type), not a business record like a payment or audit entry.

create policy analysis_events_all_staff on public.analysis_events
  for all to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy analysis_events_all_self on public.analysis_events
  for all to authenticated
  using (
    member_id = (select private.my_member_id())
    and exists (select 1 from public.analyses a where a.id = analysis_id and a.visible_to_athlete)
  )
  with check (member_id = (select private.my_member_id()) and gym_id = (select private.my_gym_id()));

-- ── Rate limit: AI-stub path only ─────────────────────────────────────────
-- The 3/gym/day cap existed to bound simulated video-processing cost/abuse.
-- That rationale doesn't apply to manual data entry (no processing to
-- bound) — a coach may legitimately want to log a whole tournament's worth
-- of historical matches in one sitting. Scoped here to method = 'ai_stub'
-- only; manual inserts skip the check and the advisory lock entirely.

create or replace function public.enforce_analysis_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lock_key bigint;
  v_count int;
begin
  if new.method <> 'ai_stub' then
    return new;
  end if;

  v_lock_key := hashtextextended(new.gym_id::text || current_date::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select count(*) into v_count
  from public.analyses
  where gym_id = new.gym_id and method = 'ai_stub' and created_at >= date_trunc('day', now());

  if v_count >= 3 then
    raise exception 'DAILY_UPLOAD_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

-- ── Athlete self-update column scope: extended for the new columns ───────
-- Athletes may now also edit duration_seconds/opponent_name/result/
-- result_method/updated_at on their own analyses (metadata entered via the
-- "Finish" step of manual logging, or corrected after an AI stub run).
-- method stays locked after creation either way — changing it after the
-- fact would let a self-service update dodge the ai_stub rate limit above.

create or replace function public.enforce_analysis_self_update_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_role public.member_role;
begin
  select role into acting_role from public.members where user_id = auth.uid();
  if acting_role = 'athlete' then
    if new.id <> old.id
      or new.member_id <> old.member_id
      or new.gym_id <> old.gym_id
      or new.title <> old.title
      or new.method <> old.method
      or new.created_by is distinct from old.created_by
      or new.visible_to_athlete <> old.visible_to_athlete
      or new.created_at <> old.created_at
    then
      raise exception 'athletes may only update status, analysed_at, duration_seconds, opponent_name, result, result_method, and updated_at on their own analyses';
    end if;
  end if;
  return new;
end;
$$;
