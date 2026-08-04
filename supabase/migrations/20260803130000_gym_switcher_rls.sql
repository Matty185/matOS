-- MatOS Stage S2 (matos_mobile_plan.md §2.3, build-sequence row S2): the
-- context switcher needs a user to be able to read the *names* of every
-- gym they hold an active membership in, not just their currently-active
-- one — but `gyms_select_own` (20260715160100) only ever allowed reading
-- `id = private.my_gym_id()`, i.e. the current gym alone. That was correct
-- when it was the only gym-scoping concept that existed; Stage S1 added
-- `memberships` specifically so an account can hold more than one, and a
-- switcher is meaningless if it can't show what it's switching *between*.
--
-- Replaces gyms_select_own with a strictly broader policy (every gym the
-- caller has an active membership in) rather than adding a second,
-- overlapping SELECT policy — Postgres ORs multiple permissive policies
-- together, so keeping both would just leave the narrower one dead weight
-- once the broader one exists (`is_current` implies `active`, so anything
-- gyms_select_own allowed, this allows too).
--
-- gyms_update_owner is untouched: an owner should only be able to *edit*
-- the gym they're currently acting in, not any gym they happen to hold
-- (possibly non-current, non-owner-role) membership in — a switcher needs
-- read access to render a list; it doesn't imply write access anywhere
-- else, and no route in this stage lets a client choose which gym_id an
-- update targets outside of what my_gym_id() already resolves to.

drop policy gyms_select_own on public.gyms;

create policy gyms_select_member on public.gyms
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships ms
      where ms.gym_id = gyms.id and ms.user_id = (select auth.uid()) and ms.active
    )
  );
