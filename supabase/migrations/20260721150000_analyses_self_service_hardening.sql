-- Stage 8 security review: analyses_insert_self / analyses_update_self
-- (20260721120000) have no column or rate-limit scope of their own. Two
-- gaps, both closed here:
--
-- 1. The 3/gym/day upload cap only existed inside
--    create_analysis_if_under_daily_limit (20260721130000), a convenience
--    RPC the app route *chooses* to call. Nothing stopped a raw client
--    .insert() from bypassing the RPC — and the advisory lock inside it —
--    entirely. Moving the same check into a BEFORE INSERT trigger closes
--    this for good: triggers fire on the underlying table regardless of
--    how the INSERT was issued, which is the real enforcement boundary
--    CLAUDE.md's model requires ("RLS at the database layer is the
--    security boundary"). The RPC's own manual check becomes fully
--    redundant once the trigger exists, so it's dropped rather than kept
--    as dead/duplicate logic.
--
-- 2. analyses_update_self permitted an athlete to update *any* column on
--    their own row — not just the status/analysed_at/report triple the
--    app route writes — including created_by (spoofing authorship) and
--    title. Low stakes today (self-inflicted, stub/mock data), but the
--    table already has staff-scoped policies for a future real
--    coach-review workflow; this closes the gap before that exists rather
--    than after. Same shape as the existing members-table guard
--    (enforce_member_self_update_scope).

drop function if exists public.create_analysis_if_under_daily_limit(uuid, uuid, text, uuid, int);

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

create trigger analyses_enforce_daily_limit
  before insert on public.analyses
  for each row execute function public.enforce_analysis_daily_limit();

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

create trigger analyses_athlete_update_scope
  before update on public.analyses
  for each row execute function public.enforce_analysis_self_update_scope();
