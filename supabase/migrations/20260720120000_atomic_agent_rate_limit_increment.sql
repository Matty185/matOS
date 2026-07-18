-- Stage 7 security review: /api/agent incremented agent_rate_limits.query_count
-- via a plain read-then-upsert (fetch query_count, upsert to value+1), the same
-- check-then-act race already fixed once for invites.attempt_count
-- (20260716140000_atomic_invite_attempt_increment.sql). Two concurrent
-- requests from the same coach can both read query_count=49, both compute
-- newCount=50, and both write 50 — losing an increment and letting the
-- 50/day hard block be bypassed indefinitely via concurrency, each bypassed
-- request still billing a real Claude API call. This function makes the
-- increment atomic; the caller uses the *returned* value for the
-- warning/block decision, never a pre-fetched one.
--
-- Unlike increment_invite_attempt (SECURITY DEFINER, called pre-auth from
-- the service-role client, EXECUTE revoked from authenticated entirely),
-- this one is SECURITY INVOKER and callable by `authenticated` directly —
-- CLAUDE.md Rule 4: "the agent uses the RLS client exclusively," including
-- for this bookkeeping table. Running as invoker means the insert/update
-- below is still subject to agent_rate_limits_all_own's own USING/WITH
-- CHECK (user_id = auth.uid() and gym_id = private.my_gym_id()) — auth.uid()
-- is taken from the session, never a function argument, and a mismatched
-- p_gym_id is independently rejected by RLS regardless of what the caller
-- passes.

create or replace function public.increment_agent_query_count(p_gym_id uuid, p_date date)
returns int
language sql
security invoker
set search_path = ''
as $$
  insert into public.agent_rate_limits (user_id, gym_id, date, query_count)
  values (auth.uid(), p_gym_id, p_date, 1)
  on conflict (user_id, date) do update set query_count = agent_rate_limits.query_count + 1
  returning query_count;
$$;

revoke execute on function public.increment_agent_query_count(uuid, date) from public, anon;
grant execute on function public.increment_agent_query_count(uuid, date) to authenticated;
