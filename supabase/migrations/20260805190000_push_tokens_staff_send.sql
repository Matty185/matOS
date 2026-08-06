-- Stage M6 ("Push sends wired... via Supabase -> Expo push"): sending a
-- push to a member other than yourself needs to read *their*
-- push_tokens rows, and Stage M1's push_tokens_all_self policy is
-- deliberately self-scoped only (registration-only infra at that stage,
-- sends weren't wired yet). Both real send triggers this stage
-- (belt promotion, a coach creating a breakdown about another member) are
-- staff-only actions (see the two routes' own RLS-backed guards), so a
-- staff-scoped read (for sending) and delete (for pruning a token Expo
-- reports as DeviceNotRegistered) — both gym-scoped, matching every other
-- staff-visibility policy in this schema (memberships_select_staff,
-- external_people_all_staff, etc.) — is the correct, minimal fix. This is
-- additive alongside push_tokens_all_self (RLS policies for the same
-- command OR together), not a replacement: self-scoped register/
-- unregister behavior is completely unchanged.
--
-- Deliberately NOT a service-role read (CLAUDE.md Rule 4 scopes
-- service-role usage to invite generation, audit log inserts, and
-- seeding only) — RLS staying the actual boundary here, not an
-- app-layer bypass, matches how every other staff-visibility need in
-- this schema has been solved.

create policy push_tokens_select_staff on public.push_tokens
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy push_tokens_delete_staff on public.push_tokens
  for delete to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));
