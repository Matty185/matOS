-- Stage 8: /api/video/upload checked today's upload count (SELECT count(*))
-- and then inserted as two separate statements — the same check-then-act
-- race already fixed twice in this project (invite attempt_count, agent
-- rate_limit query_count). Caught here when a test with two near-concurrent
-- uploads landed both count checks before either insert committed, letting
-- the 3/gym/day cap be bypassed. Lower stakes than the previous two (no
-- billing exposure, no brute-force surface — this is a stub feature with a
-- cosmetic daily cap), but the fix is the same well-understood shape, so it
-- gets the same treatment rather than being waved off as "just a stub."
--
-- Unlike the counter-table approach used for agent_rate_limits (a natural
-- per-user-per-day row to increment), analyses rows ARE the count — there's
-- no counter column to atomically increment. A transaction-scoped advisory
-- lock keyed on (gym_id, day) serializes concurrent callers for the same
-- gym+day without a new table: the count-then-insert inside becomes
-- effectively atomic relative to any other call holding the same key. The
-- lock auto-releases at transaction end (pg_advisory_xact_lock), so nothing
-- can be left held by a crashed/aborted caller.
--
-- SECURITY INVOKER (not DEFINER): the insert inside still needs to satisfy
-- analyses_insert_self's RLS check (member_id/gym_id/created_by scoped to
-- the caller), so this runs as the calling authenticated user, consistent
-- with "the RLS client is the enforcement boundary."

create or replace function public.create_analysis_if_under_daily_limit(
  p_member_id uuid,
  p_gym_id uuid,
  p_title text,
  p_created_by uuid,
  p_limit int
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lock_key bigint;
  v_count int;
  v_id uuid;
begin
  v_lock_key := hashtextextended(p_gym_id::text || current_date::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select count(*) into v_count
  from public.analyses
  where gym_id = p_gym_id and created_at >= date_trunc('day', now());

  if v_count >= p_limit then
    return null;
  end if;

  insert into public.analyses (member_id, gym_id, title, status, created_by, visible_to_athlete)
  values (p_member_id, p_gym_id, p_title, 'pending', p_created_by, true)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_analysis_if_under_daily_limit(uuid, uuid, text, uuid, int) from public, anon;
grant execute on function public.create_analysis_if_under_daily_limit(uuid, uuid, text, uuid, int) to authenticated;
