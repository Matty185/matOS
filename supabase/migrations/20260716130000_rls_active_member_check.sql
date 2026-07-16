-- Stage 2 security review: none of the private.* RLS helper functions
-- checked the caller's own members.active — deactivation was enforced only
-- in withAuth (API-layer convenience), never at the DB layer, which is the
-- actual security boundary per CLAUDE.md Rule 2. A deactivated member's
-- Supabase Auth session isn't itself revoked by flipping members.active (it's
-- a DB flag, not a session kill), and this app's browser client talks to
-- Supabase directly for most reads — so a deactivated coach or athlete could
-- keep reading/writing gym data indefinitely via direct RLS-scoped queries,
-- entirely bypassing withAuth. Closed here rather than left for whichever
-- stage first makes it exploitable in practice.
--
-- create or replace on the same five functions from
-- 20260715160100_rls_and_functions.sql — a new migration, not an edit to an
-- already-applied one, per CLAUDE.md's migration convention.

create or replace function private.my_gym_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select gym_id from public.members where user_id = auth.uid() and active limit 1;
$$;

create or replace function private.my_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.members where user_id = auth.uid() and active limit 1;
$$;

create or replace function private.my_role()
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.members where user_id = auth.uid() and active limit 1;
$$;

create or replace function private.is_coach_or_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select role in ('coach', 'gym_owner') from public.members where user_id = auth.uid() and active limit 1;
$$;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select role = 'gym_owner' from public.members where user_id = auth.uid() and active limit 1;
$$;
