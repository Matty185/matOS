-- Scraps the pre-plan "hard-metrics event log" analysis rework
-- (20260722130000_analysis_events_rework.sql,
-- 20260723160000_add_takedown_defence_event_type.sql) in favour of the
-- Match Analysis Module plan (matos_analysis_module_plan.md, CLAUDE.md's
-- "Match Analysis Module" section) — a different data model entirely
-- (breakdowns/breakdown_positions/breakdown_events/event_types/
-- external_people), to be built from Stage A1 onward. This is not normal
-- forward schema evolution — it's discarding a detour before A1 lays down
-- the real schema, so it surgically undoes exactly what those two
-- migrations did, restoring `analyses` to byte-identical shape with the
-- original alpha stub (which stays in place — the addendum explicitly
-- keeps the mock Analysis tab until Stage A7 replaces it).

-- ── Drop analysis_events entirely ────────────────────────────────────────

drop table if exists public.analysis_events;
drop function if exists public.derive_ids_from_analysis();
drop type if exists public.analysis_event_type;

-- ── Restore analyses to its original alpha shape ─────────────────────────

alter table public.analyses
  drop column if exists method,
  drop column if exists duration_seconds,
  drop column if exists opponent_name,
  drop column if exists result,
  drop column if exists result_method,
  drop column if exists updated_at;

alter table public.analyses add column report jsonb;

drop trigger if exists analyses_set_updated_at on public.analyses;

drop type if exists public.analysis_method;
drop type if exists public.analysis_result;
drop type if exists public.analysis_result_method;

-- ── Restore the two trigger functions to their original bodies
-- (verbatim from 20260721150000_analyses_self_service_hardening.sql) ─────

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
  v_lock_key := hashtextextended(new.gym_id::text || current_date::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select count(*) into v_count
  from public.analyses
  where gym_id = new.gym_id and created_at >= date_trunc('day', now());

  if v_count >= 3 then
    raise exception 'DAILY_UPLOAD_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

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
      or new.created_by is distinct from old.created_by
      or new.visible_to_athlete <> old.visible_to_athlete
      or new.created_at <> old.created_at
    then
      raise exception 'athletes may only update status, analysed_at, and report on their own analyses';
    end if;
  end if;
  return new;
end;
$$;
