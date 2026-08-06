-- Stage M6 all-reviewer gate fix (security-reviewer, HIGH, live-confirmed
-- against pg_policies before this fix): the new "breakdown shared with
-- you" push always points to a breakdown the recipient's own RLS forbids
-- them from ever viewing. breakdowns_all_own requires author_id =
-- auth.uid() across every one of its branches (including the
-- member_id-focus branch), and breakdowns_select_staff is staff-only — so
-- a non-author athlete who is merely a breakdown's *focus* (member_id)
-- has never had SELECT access to it, at any visibility, since Stage A1.
--
-- This isn't new to M6 — it's a pre-existing gap M6 is simply the first
-- feature to actively surface to a real user via a notification promising
-- something the database has always refused. It also means an athlete's
-- own computed profile (fetchAthleteProfileData, Stage A5/A7, rendered by
-- both web's analysis/athlete/[id]/page.tsx and mobile's Stage M5
-- athlete/[id].tsx when viewing themselves) has silently excluded any
-- breakdown a coach authored about them, even ones the coach explicitly
-- marked shareable with the gym — "my own profile" was only ever built
-- from self-authored breakdowns. This migration fixes that too, not just
-- the push's own dead-end link.
--
-- Fix: a focus-member SELECT policy on breakdowns and both child tables,
-- gated on visibility = 'gym'. A 'private' breakdown stays exactly what
-- its name implies — the author's own analysis notes, not shared with its
-- subject — the existing visibility toggle is the deliberate,
-- already-reviewed mechanism for that distinction and is unchanged here.
-- Additive alongside breakdowns_all_own (a self-authored breakdown is
-- already visible via that policy regardless of visibility, unaffected)
-- — this only matters for the case that policy never covered: a
-- breakdown authored by someone else, about me, marked shareable.

create policy breakdowns_select_focus_self on public.breakdowns
  for select to authenticated
  using (
    member_id = (select private.my_member_id())
    and gym_id = (select private.my_gym_id())
    and visibility = 'gym'
  );

create policy breakdown_positions_select_focus_self on public.breakdown_positions
  for select to authenticated
  using (
    gym_id = (select private.my_gym_id())
    and exists (
      select 1 from public.breakdowns b
      where b.id = breakdown_positions.breakdown_id
        and b.member_id = (select private.my_member_id())
        and b.visibility = 'gym'
    )
  );

create policy breakdown_events_select_focus_self on public.breakdown_events
  for select to authenticated
  using (
    gym_id = (select private.my_gym_id())
    and exists (
      select 1 from public.breakdowns b
      where b.id = breakdown_events.breakdown_id
        and b.member_id = (select private.my_member_id())
        and b.visibility = 'gym'
    )
  );
