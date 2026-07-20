-- Stage 11 (pre-demo full ECC review pass): three related, independently
-- low-risk hardening fixes found by the security-reviewer and
-- database-reviewer agents, grouped into one migration since they're all
-- RLS/grant tightening with no application-code dependency on the old
-- behaviour.

-- ── 1. members self-policies never inherited the "active" filter ─────────
-- 20260716130000 closed "a deactivated coach/athlete can keep reading/
-- writing gym data" by adding `and active` to the five private.*() helper
-- functions. Every other table's *_self policy routes through
-- private.my_member_id() and inherited that fix automatically — members'
-- own self-policies compare `user_id = auth.uid()` directly instead, so
-- they never did. Concrete gap: a deactivated coach's still-valid session
-- (not revoked on deactivation — see src/lib/auth/current-member.ts's own
-- comment on this) can call `supabase.from('members').update({active:
-- true}).eq('id', <own id>)` directly against the RLS client and pass
-- members_update_self's USING/WITH CHECK, silently reversing their own
-- deactivation at the database layer — the one layer CLAUDE.md Rule 2 says
-- must not depend on the application's (bypassable) checks. Athlete
-- self-reactivation was separately blocked already by
-- enforce_member_self_update_scope's explicit `active <> old.active` check
-- for that role; this gap is specific to coach/owner rows, which that
-- trigger treats as a no-op.
--
-- Fix: route through private.my_member_id() like every other table. Since
-- that helper already filters `and active`, a deactivated member's own row
-- simply stops matching — the update affects 0 rows, no new trigger logic
-- needed.

drop policy members_select_self on public.members;
create policy members_select_self on public.members
  for select to authenticated
  using (id = (select private.my_member_id()));

drop policy members_update_self on public.members;
create policy members_update_self on public.members
  for update to authenticated
  using (id = (select private.my_member_id()))
  with check (id = (select private.my_member_id()));

-- ── 2. agent_rate_limits RLS granted full CRUD instead of SELECT-only ────
-- `for all` let any coach DELETE or UPDATE their own row directly via the
-- anon key + their own session token, resetting query_count to 0 (or
-- deleting the row outright) whenever they liked — a complete, single-
-- request bypass of the 40/50-per-day agent cap, not merely the
-- concurrent-request race increment_agent_query_count
-- (20260720120000) already fixed. That function is the only place
-- application code touches this table; RLS itself never actually
-- restricted a legitimate session to going through it.
--
-- Fix: SELECT-only for the owning user — no INSERT/UPDATE/DELETE grant to
-- `authenticated` on this table at all. increment_agent_query_count moves
-- from SECURITY INVOKER to SECURITY DEFINER (matching
-- increment_invite_attempt's existing pattern) so it can still perform its
-- upsert despite RLS now blocking every other write path; auth.uid() is
-- still read from the session inside the function body, never a caller-
-- supplied argument, so the DEFINER escalation doesn't reopen a path to
-- writing another user's counter.

drop policy agent_rate_limits_all_own on public.agent_rate_limits;
create policy agent_rate_limits_select_own on public.agent_rate_limits
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.increment_agent_query_count(p_gym_id uuid, p_date date)
returns int
language sql
security definer
set search_path = ''
as $$
  insert into public.agent_rate_limits (user_id, gym_id, date, query_count)
  values (auth.uid(), p_gym_id, p_date, 1)
  on conflict (user_id, date) do update set query_count = agent_rate_limits.query_count + 1
  returning query_count;
$$;

-- ── 3. private.*() helpers relied on schema-USAGE denial, not an explicit
--       revoke ────────────────────────────────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC by default on new functions. These were
-- never reachable by anon/public in practice (anon was never granted USAGE
-- on the private schema), but every other SECURITY DEFINER function added
-- since (increment_invite_attempt, increment_agent_query_count) explicitly
-- revokes EXECUTE from public rather than relying on that side channel.
-- Matching that pattern here for consistency and so this doesn't silently
-- become exploitable if a future migration ever grants schema usage more
-- broadly.

revoke execute on function private.my_gym_id() from public;
revoke execute on function private.my_member_id() from public;
revoke execute on function private.my_role() from public;
revoke execute on function private.is_coach_or_owner() from public;
revoke execute on function private.is_owner() from public;

-- ── 4. redundant index ────────────────────────────────────────────────────
-- members_user_id_idx duplicates the index Postgres already creates
-- implicitly for `user_id uuid unique references auth.users(id)` — same
-- single column, pure write/storage overhead with no query benefit.

drop index if exists public.members_user_id_idx;
