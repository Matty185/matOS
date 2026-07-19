-- Stage 8: the analyses table only had staff-scoped INSERT/UPDATE policies
-- (analyses_insert_staff / analyses_update_staff, both is_coach_or_owner()).
-- Stage 1 modelled analyses around a coach-managed workflow; it didn't yet
-- know the plan's actual Upload feature (§7 Athlete screens: "video stub ->
-- loading -> mock report") is athlete-initiated — the athlete uploads their
-- own clip and the server flips the row from pending to complete on their
-- behalf, both as their own session. Found via live testing: POST
-- /api/video/upload returned a 500 on the very first insert (RLS silently
-- rejected it) since no policy let an athlete write their own analyses row
-- at all. athlete_logs got exactly this "full CRUD on own rows" treatment
-- in Stage 1 already (see athlete_logs_all_self) — analyses just missed it
-- because self-service upload didn't exist yet at the time.
--
-- created_by = auth.uid() on the insert check mirrors
-- attendance_insert_self's checked_in_by = 'self' pattern: the route
-- already sets created_by server-side from context.userId (never client-
-- trusted), and this makes that the enforced boundary, not just convention.

create policy analyses_insert_self on public.analyses
  for insert to authenticated
  with check (
    member_id = (select private.my_member_id())
    and gym_id = (select private.my_gym_id())
    and created_by = (select auth.uid())
  );

create policy analyses_update_self on public.analyses
  for update to authenticated
  using (member_id = (select private.my_member_id()))
  with check (member_id = (select private.my_member_id()) and gym_id = (select private.my_gym_id()));
