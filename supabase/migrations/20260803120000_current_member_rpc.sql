-- MatOS Stage S2 (matos_mobile_plan.md §2.3, build-sequence row S2): fixes
-- a real bug in this codebase's two most widely-used "who is the caller"
-- lookups, surfaced by S2's own research pass rather than by the S1
-- BLOCKING gate (S1 only rewrote the RLS-internal `private.*()` helper
-- functions — it correctly did not touch application code, since S1's own
-- scope was schema/RLS only).
--
-- THE BUG: `apps/web/src/lib/auth/withAuth.ts` and
-- `apps/web/src/lib/auth/current-member.ts` both resolve "the caller's
-- member row" via a direct, unscoped
-- `supabase.from("members").select(...).eq("user_id", user.id).single()`
-- query — the exact same assumption the S1 migration's design notes
-- describe at length for the `private.*()` RLS functions ("members.user_id
-- carried a global UNIQUE constraint, so this was always unambiguous").
-- That constraint was relaxed in S1. Once any user has more than one
-- `members` row (a personal workspace plus a real gym, which is the entire
-- point of S2), `.single()` on an unscoped `user_id` lookup either throws
-- (PostgREST errors on >1 matching row) or, if the code were changed to
-- tolerate multiple rows without scoping, returns an arbitrary one —
-- either way, every authenticated page load (`current-member.ts`, used by
-- the root redirect and both `(coach)`/`(athlete)` layouts) and every
-- `withAuth`-wrapped API route would break or silently resolve to the
-- wrong gym for exactly the population S2 exists to introduce.
--
-- THE FIX: rather than duplicating the correct join logic (memberships
-- joined to members, is_current + active on both) a second and third time
-- in TypeScript, expose one new function that reuses the already-correct,
-- already-reviewed S1 logic. `private.my_member_id()` already does exactly
-- this resolution — but it lives in the `private` schema specifically so
-- it is NOT exposed by PostgREST (S1's own design note: "not exposed by
-- PostgREST"), so application code cannot call it directly. This migration
-- adds a thin `public.current_member()` wrapper that PostgREST *can* serve
-- as an RPC, delegating to `private.my_member_id()` for the actual
-- resolution rather than re-implementing it — one authoritative
-- resolution path, reused by the RLS layer, `withAuth`, and every layout.
--
-- SECURITY INVOKER, not DEFINER: unlike the `private.*()` functions (which
-- must bypass RLS to be usable as a building block *inside* other RLS
-- policies without infinite recursion), this function is called directly
-- by already-authenticated application code and only needs to return data
-- the caller could already read themselves via `members_select_self` —
-- least-privilege says it should run as the calling role, not an elevated
-- one, even though the `private.my_member_id()` call it delegates to is
-- independently SECURITY DEFINER and self-contained regardless.

-- gym_kind is joined in directly (not a second round-trip from app code):
-- several S2 call sites (the root redirect, the solo-only deletion-scope
-- check) need to know whether the caller's current gym is a personal
-- workspace, and the caller can already read this via gyms_select_member
-- regardless, so returning it here is free.
create or replace function public.current_member()
returns table (
  id uuid,
  gym_id uuid,
  gym_kind public.gym_kind,
  role public.member_role,
  first_name text,
  last_name text,
  user_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.id, m.gym_id, g.kind, m.role, m.first_name, m.last_name, m.user_id
  from public.members m
  join public.gyms g on g.id = m.gym_id
  where m.id = (select private.my_member_id());
$$;

grant execute on function public.current_member() to authenticated;
