-- Stage 2 security review: the claim route incremented invites.attempt_count
-- via a plain read-then-write (fetch attempt_count, update to value+1),
-- which is a check-then-act race — concurrent requests against the same
-- token can all read the same stale count and each write stale+1, losing
-- most of the increments. Given raw tokens are unguessable 128-bit UUIDv4s,
-- the practical exploitability is low, but the 5-attempt cap is an explicit
-- Security Non-Negotiable (plan §8.5), so it gets a real fix rather than an
-- accepted risk. This function makes the increment atomic; the caller uses
-- the *returned* value for the lockout decision, never a pre-fetched one.
--
-- No EXECUTE grant to anon/authenticated: this is called exclusively from
-- the claim route's service-role client, which bypasses grants entirely as
-- the function owner. Explicitly revoked from PUBLIC regardless, since
-- Postgres grants EXECUTE to PUBLIC by default on new functions, and this
-- must not be reachable via PostgREST's public schema RPC exposure — an
-- unauthenticated caller with no valid token could otherwise lock out any
-- invite by id alone.

create or replace function public.increment_invite_attempt(invite_id uuid)
returns int
language sql
security definer
set search_path = ''
as $$
  update public.invites set attempt_count = attempt_count + 1 where id = invite_id returning attempt_count;
$$;

revoke execute on function public.increment_invite_attempt(uuid) from public, anon, authenticated;
