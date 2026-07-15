-- MatOS Stage 1: helper functions, triggers, and RLS policies.
--
-- Non-recursion pattern: all gym_id/role lookups go through SECURITY
-- DEFINER functions in the `private` schema (not exposed by PostgREST, whose
-- default exposed schema is `public`). These functions are owned by the
-- migration-running role (table owner), which is NOT subject to its own
-- table's RLS by default — this is what lets a `members` RLS policy call a
-- function that itself queries `members` without infinite recursion. This is
-- the standard documented Supabase pattern. Deliberately not using FORCE ROW
-- LEVEL SECURITY anywhere: that would make RLS apply to the table owner too,
-- breaking this exact pattern, and application traffic never connects as the
-- table owner in the first place (only `anon`/`authenticated`/`service_role`
-- do), so FORCE buys nothing here.
--
-- Every policy is scoped `to authenticated` explicitly (never left to
-- default to `public`) so `anon` is categorically excluded even if a policy
-- condition had a bug — belt-and-braces for "no public SELECT on anything."
--
-- Every `auth.uid()` / `private.*()` call inside a policy body is wrapped in
-- `(select ...)` — the documented Supabase RLS performance pattern that lets
-- Postgres evaluate it once per query (via an InitPlan) instead of once per
-- row. Not needed inside the helper functions' own SQL bodies below, since
-- those already run once per invocation regardless.

create schema if not exists private;
grant usage on schema private to authenticated;

-- ── Helper functions ──────────────────────────────────────────────────────

create or replace function private.my_gym_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select gym_id from public.members where user_id = auth.uid() limit 1;
$$;

create or replace function private.my_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.members where user_id = auth.uid() limit 1;
$$;

create or replace function private.my_role()
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.members where user_id = auth.uid() limit 1;
$$;

create or replace function private.is_coach_or_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select role in ('coach', 'gym_owner') from public.members where user_id = auth.uid() limit 1;
$$;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select role = 'gym_owner' from public.members where user_id = auth.uid() limit 1;
$$;

grant execute on function private.my_gym_id() to authenticated;
grant execute on function private.my_member_id() to authenticated;
grant execute on function private.my_role() to authenticated;
grant execute on function private.is_coach_or_owner() to authenticated;
grant execute on function private.is_owner() to authenticated;

-- ── updated_at trigger ────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger members_set_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

create trigger athlete_logs_set_updated_at
  before update on public.athlete_logs
  for each row execute function public.set_updated_at();

-- ── audit_log immutability trigger ───────────────────────────────────────
-- Fires regardless of role, including service_role (RLS bypass does not
-- bypass triggers) — the actual enforcement of "audit log is immutable."
--
-- DELETE is blocked outright. UPDATE is blocked *except* for nulling
-- actor_id and nothing else. Two things need exactly that one allowance:
-- (1) audit_log.actor_id references auth.users(id) on delete set null —
-- Postgres implements that referential action as an internal UPDATE on
-- audit_log, and ordinary row-level triggers do fire for it (only
-- statement-level triggers are exempt), so an unconditional UPDATE block
-- would make it impossible to ever delete a user who has ever acted as an
-- audit actor. (2) plan §7's GDPR deletion flow requires "audit retained
-- with actor anonymised" — an UPDATE that nulls actor_id — which would
-- otherwise be impossible to build even via the service-role client.
-- Every other column, and re-populating actor_id once nulled, stays blocked.

create or replace function public.audit_log_block_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'audit_log is immutable: delete is not permitted';
  end if;

  if new.id is distinct from old.id
    or new.gym_id is distinct from old.gym_id
    or new.action is distinct from old.action
    or new.entity_type is distinct from old.entity_type
    or new.entity_id is distinct from old.entity_id
    or new.before_state is distinct from old.before_state
    or new.after_state is distinct from old.after_state
    or new."timestamp" is distinct from old."timestamp"
    or new.initiated_by is distinct from old.initiated_by
    or new.agent_query is distinct from old.agent_query
    or new.actor_id is not null
  then
    raise exception 'audit_log is immutable: only nulling actor_id (GDPR actor anonymisation, or an auth.users deletion cascade) is permitted';
  end if;
  return new;
end;
$$;

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.audit_log_block_mutation();

create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.audit_log_block_mutation();

-- ── attendance: derive checked_in_date ───────────────────────────────────
-- See comment on the column in the schema migration for why this is a
-- trigger rather than a GENERATED column.

create or replace function public.attendance_set_checked_in_date()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.checked_in_date = (new.checked_in_at at time zone 'utc')::date;
  return new;
end;
$$;

create trigger attendance_set_checked_in_date
  before insert or update on public.attendance
  for each row execute function public.attendance_set_checked_in_date();

-- ── members: role-escalation guard ───────────────────────────────────────
-- Plan §4: "Owner = coach permissions + manage coach profiles + gym
-- settings." Read as: only an owner may create or promote a coach/owner.
-- Without this, a compromised or careless coach account could self-escalate
-- or mint accomplice coach accounts via ordinary member CRUD. `acting_role
-- is null` covers service-role actors (no auth.uid() — seeding, invite
-- generation), who are trusted by construction per CLAUDE.md Rule 4.

create or replace function public.enforce_member_role_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_role public.member_role;
begin
  select role into acting_role from public.members where user_id = auth.uid();
  if acting_role is not null and acting_role <> 'gym_owner' and new.role <> 'athlete' then
    raise exception 'only a gym owner may add a member with an elevated role';
  end if;
  return new;
end;
$$;

create trigger members_role_escalation_guard_insert
  before insert on public.members
  for each row execute function public.enforce_member_role_insert_guard();

create or replace function public.enforce_member_role_update_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_role public.member_role;
begin
  select role into acting_role from public.members where user_id = auth.uid();
  if acting_role is not null and acting_role <> 'gym_owner' and new.role is distinct from old.role then
    raise exception 'only a gym owner may change a member''s role';
  end if;
  return new;
end;
$$;

create trigger members_role_escalation_guard_update
  before update on public.members
  for each row execute function public.enforce_member_role_update_guard();

-- ── members: athlete self-update column scope ────────────────────────────
-- RLS (below) restricts athletes to their own row; this trigger adds the
-- column-level restriction RLS can't express ("update own contact fields
-- only"). Athlete-editable columns: phone, emergency_contact_name,
-- emergency_contact_phone, photo_url. Everything else is rejected outright
-- when the acting user's own role is 'athlete'. No-ops for coach/owner/
-- service-role actors.

create or replace function public.enforce_member_self_update_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_role public.member_role;
begin
  select role into acting_role from public.members where user_id = auth.uid();
  if acting_role = 'athlete' then
    if new.id <> old.id
      or new.gym_id <> old.gym_id
      or new.user_id is distinct from old.user_id
      or new.role <> old.role
      or new.first_name <> old.first_name
      or new.last_name <> old.last_name
      or new.email <> old.email
      or new.join_date <> old.join_date
      or new.belt <> old.belt
      or new.stripes <> old.stripes
      or new.membership_plan <> old.membership_plan
      or coalesce(new.notes, '') <> coalesce(old.notes, '')
      or new.active <> old.active
      or new.created_at <> old.created_at
    then
      raise exception 'athletes may only update their own contact fields';
    end if;
  end if;
  return new;
end;
$$;

create trigger members_athlete_update_scope
  before update on public.members
  for each row execute function public.enforce_member_self_update_scope();

-- ── Cross-tenant referential integrity ────────────────────────────────────
-- RLS with-check clauses validate a row's own `gym_id` against the caller's
-- gym, but never validated that a client-supplied `member_id` (or, for
-- attendance, `class_id`) actually belongs to that same gym — a coach (or,
-- for attendance, a self-check-in) could reference another gym's member/
-- class while `gym_id` still matched their own. Closed by deriving `gym_id`
-- from the referenced row server-side instead of trusting client input,
-- following the same pattern already used for attendance.checked_in_date.
-- Runs before the existing `gym_id = private.my_gym_id()` RLS checks, which
-- still apply and now validate the true derived value rather than a
-- client-supplied one.

create or replace function public.derive_gym_id_from_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_gym_id uuid;
begin
  select gym_id into member_gym_id from public.members where id = new.member_id;
  if member_gym_id is null then
    raise exception 'member_id does not reference an existing member';
  end if;
  new.gym_id = member_gym_id;
  return new;
end;
$$;

create trigger belt_history_derive_gym_id
  before insert or update on public.belt_history
  for each row execute function public.derive_gym_id_from_member();

create trigger payments_derive_gym_id
  before insert or update on public.payments
  for each row execute function public.derive_gym_id_from_member();

create trigger analyses_derive_gym_id
  before insert or update on public.analyses
  for each row execute function public.derive_gym_id_from_member();

create trigger athlete_logs_derive_gym_id
  before insert or update on public.athlete_logs
  for each row execute function public.derive_gym_id_from_member();

create trigger gdpr_consents_derive_gym_id
  before insert or update on public.gdpr_consents
  for each row execute function public.derive_gym_id_from_member();

create trigger invites_derive_gym_id
  before insert or update on public.invites
  for each row execute function public.derive_gym_id_from_member();

create trigger deletion_requests_derive_gym_id
  before insert or update on public.deletion_requests
  for each row execute function public.derive_gym_id_from_member();

-- attendance additionally needs class_id validated against the same gym.

create or replace function public.derive_and_validate_attendance_gym_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_gym_id uuid;
  class_gym_id uuid;
begin
  select gym_id into member_gym_id from public.members where id = new.member_id;
  select gym_id into class_gym_id from public.classes where id = new.class_id;
  if member_gym_id is null then
    raise exception 'member_id does not reference an existing member';
  end if;
  if class_gym_id is null then
    raise exception 'class_id does not reference an existing class';
  end if;
  if member_gym_id <> class_gym_id then
    raise exception 'member and class belong to different gyms';
  end if;
  new.gym_id = member_gym_id;
  return new;
end;
$$;

create trigger attendance_derive_gym_id
  before insert or update on public.attendance
  for each row execute function public.derive_and_validate_attendance_gym_id();

-- ── Actor attribution ─────────────────────────────────────────────────────
-- `payments.recorded_by`, `belt_history.promoted_by`, `analyses.created_by`,
-- `invites.created_by` had no DB-level enforcement that they equal the
-- acting user — since writes normally go through the RLS-respecting browser
-- client (CLAUDE.md Rule 4), a coach session could set these to an arbitrary
-- user id, misattributing a payment/promotion/analysis/invite. Forced to
-- auth.uid() for ordinary authenticated actors; left as explicitly passed
-- for service-role actors (auth.uid() is null there — e.g. seeding).
--
-- INSERT only, deliberately not UPDATE: found in review that an
-- insert-or-update version silently reassigns attribution to whoever
-- performs any later, unrelated edit (e.g. Coach B fixing a typo in
-- `notes` would have overwritten `recorded_by` from Coach A to Coach B) —
-- clobbering exactly the history this trigger exists to protect. Insert-time
-- spoofing was the actual threat; scoping to INSERT closes that without the
-- clobbering side effect.

create or replace function public.enforce_recorded_by_self()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.recorded_by = auth.uid();
  end if;
  return new;
end;
$$;

create trigger payments_recorded_by_self
  before insert on public.payments
  for each row execute function public.enforce_recorded_by_self();

create or replace function public.enforce_promoted_by_self()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.promoted_by = auth.uid();
  end if;
  return new;
end;
$$;

create trigger belt_history_promoted_by_self
  before insert on public.belt_history
  for each row execute function public.enforce_promoted_by_self();

create or replace function public.enforce_created_by_self()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.created_by = auth.uid();
  end if;
  return new;
end;
$$;

create trigger analyses_created_by_self
  before insert on public.analyses
  for each row execute function public.enforce_created_by_self();

create trigger invites_created_by_self
  before insert on public.invites
  for each row execute function public.enforce_created_by_self();

-- ── Table-level privilege hardening ───────────────────────────────────────
-- TRUNCATE is not governed by RLS and does not fire row-level triggers
-- (so the audit_log immutability triggers above do not stop it) — a
-- documented Postgres/Supabase gotcha. Supabase's project bootstrap grants
-- broad default privileges (including TRUNCATE, via `ALL`) to `anon`/
-- `authenticated` on new tables, which would otherwise let any authenticated
-- user — including an athlete — erase audit_log or any other table outright.
-- Revoked explicitly rather than relying on the default not having been
-- applied. The plain REVOKE only covers the 14 tables that exist as of this
-- migration — the ALTER DEFAULT PRIVILEGES statement below additionally
-- closes it permanently for tables created by future migrations, since
-- Supabase's default-privilege grant would otherwise silently re-apply to
-- every new table Stage 2+ adds.

revoke truncate on all tables in schema public from authenticated, anon;
alter default privileges in schema public revoke truncate on tables from authenticated, anon;

-- ── Enable RLS everywhere ─────────────────────────────────────────────────

alter table public.gyms enable row level security;
alter table public.members enable row level security;
alter table public.belt_history enable row level security;
alter table public.classes enable row level security;
alter table public.attendance enable row level security;
alter table public.payments enable row level security;
alter table public.audit_log enable row level security;
alter table public.analyses enable row level security;
alter table public.athlete_logs enable row level security;
alter table public.gdpr_consents enable row level security;
alter table public.invites enable row level security;
alter table public.notifications enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.agent_rate_limits enable row level security;

-- ── gyms ──────────────────────────────────────────────────────────────────
-- No INSERT policy (service role / seeding only). DELETE disabled entirely.

create policy gyms_select_own on public.gyms
  for select to authenticated
  using (id = (select private.my_gym_id()));

create policy gyms_update_owner on public.gyms
  for update to authenticated
  using (id = (select private.my_gym_id()) and (select private.is_owner()))
  with check (id = (select private.my_gym_id()) and (select private.is_owner()));

-- ── members ───────────────────────────────────────────────────────────────
-- Coach/owner: full CRUD in gym except DELETE (deactivate via `active`
-- instead, per CLAUDE.md Rule 6). Athlete: select own row, update own row
-- (column scope enforced by trigger above).

create policy members_select_staff on public.members
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy members_select_self on public.members
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy members_insert_staff on public.members
  for insert to authenticated
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy members_update_staff on public.members
  for update to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy members_update_self on public.members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── belt_history ──────────────────────────────────────────────────────────
-- Plan §4 lists "INSERT/UPDATE in gym" for coach/owner; SELECT for coach/
-- owner is added here since the Belt History profile tab requires it —
-- an evident gap in the plan's abbreviated table, not a deviation.

create policy belt_history_select_staff on public.belt_history
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy belt_history_select_self on public.belt_history
  for select to authenticated
  using (member_id = (select private.my_member_id()));

create policy belt_history_insert_staff on public.belt_history
  for insert to authenticated
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy belt_history_update_staff on public.belt_history
  for update to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

-- ── classes ───────────────────────────────────────────────────────────────
-- Not in the plan's §4 RLS summary table; inferred as: any gym member can
-- read the schedule (needed for athlete check-in), coach/owner manage it.

create policy classes_select_gym on public.classes
  for select to authenticated
  using (gym_id = (select private.my_gym_id()));

create policy classes_insert_staff on public.classes
  for insert to authenticated
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy classes_update_staff on public.classes
  for update to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy classes_delete_staff on public.classes
  for delete to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

-- ── attendance ────────────────────────────────────────────────────────────
-- Coach/owner: full in gym. Athlete: select own, insert own self-check-in
-- only (checked_in_by must be 'self'; class/gym match enforced).

create policy attendance_select_staff on public.attendance
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy attendance_select_self on public.attendance
  for select to authenticated
  using (member_id = (select private.my_member_id()));

create policy attendance_insert_staff on public.attendance
  for insert to authenticated
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy attendance_insert_self on public.attendance
  for insert to authenticated
  with check (
    member_id = (select private.my_member_id())
    and gym_id = (select private.my_gym_id())
    and checked_in_by = 'self'
  );

create policy attendance_update_staff on public.attendance
  for update to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy attendance_delete_staff on public.attendance
  for delete to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

-- ── payments ──────────────────────────────────────────────────────────────
-- DELETE disabled. `amount` column visibility for athletes is a Stage 2
-- API-layer concern — see comment in the schema migration.

create policy payments_select_staff on public.payments
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy payments_select_self on public.payments
  for select to authenticated
  using (member_id = (select private.my_member_id()));

create policy payments_insert_staff on public.payments
  for insert to authenticated
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy payments_update_staff on public.payments
  for update to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

-- ── audit_log ─────────────────────────────────────────────────────────────
-- SELECT only for coach/owner. No INSERT/UPDATE/DELETE policy for
-- `authenticated` at all — inserts happen exclusively via the service-role
-- client (which bypasses RLS by design), and the triggers above additionally
-- block UPDATE/DELETE for every role including service_role.

create policy audit_log_select_staff on public.audit_log
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

-- ── analyses ──────────────────────────────────────────────────────────────
-- DELETE disabled. Athlete sees own analyses only where visible_to_athlete.

create policy analyses_select_staff on public.analyses
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy analyses_select_self on public.analyses
  for select to authenticated
  using (member_id = (select private.my_member_id()) and visible_to_athlete);

create policy analyses_insert_staff on public.analyses
  for insert to authenticated
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy analyses_update_staff on public.analyses
  for update to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

-- ── athlete_logs ──────────────────────────────────────────────────────────
-- Athlete: full CRUD on own rows. Coach/owner: read-only where flagged
-- visible_to_coach (matches "SELECT in gym where visible_to_coach").

create policy athlete_logs_select_staff on public.athlete_logs
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()) and visible_to_coach);

create policy athlete_logs_all_self on public.athlete_logs
  for all to authenticated
  using (member_id = (select private.my_member_id()))
  with check (member_id = (select private.my_member_id()) and gym_id = (select private.my_gym_id()));

-- ── gdpr_consents ─────────────────────────────────────────────────────────
-- Not in the plan's §4 table. Writes are service-role only (registration/
-- claim flow, Stage 2) — no authenticated INSERT/UPDATE policy for now.
-- Revisit if athlete self-service consent changes are needed later.

create policy gdpr_consents_select_staff on public.gdpr_consents
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy gdpr_consents_select_self on public.gdpr_consents
  for select to authenticated
  using (member_id = (select private.my_member_id()));

-- ── invites ───────────────────────────────────────────────────────────────
-- Coach/owner: read-only (claimed/unclaimed status on the member profile).
-- All writes are service-role only per CLAUDE.md Rule 4.

create policy invites_select_staff on public.invites
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

-- ── notifications ─────────────────────────────────────────────────────────
-- Infrastructure only in alpha (no UI). SELECT/UPDATE(read) own, per §4.
-- Writes (INSERT) are service-role only.

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));

-- ── deletion_requests ─────────────────────────────────────────────────────
-- Athlete: create + view own request. Coach/owner: view + mark executed.
-- The anonymisation itself (member row + cascading table cleanup per plan
-- §7) is a Stage 2/8 service-role operation, not modelled here.

create policy deletion_requests_select_staff on public.deletion_requests
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy deletion_requests_select_self on public.deletion_requests
  for select to authenticated
  using (member_id = (select private.my_member_id()));

create policy deletion_requests_insert_self on public.deletion_requests
  for insert to authenticated
  with check (member_id = (select private.my_member_id()) and gym_id = (select private.my_gym_id()));

create policy deletion_requests_update_staff on public.deletion_requests
  for update to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

-- ── agent_rate_limits ─────────────────────────────────────────────────────
-- Own-row bookkeeping only, read/written by the coach's own RLS-respecting
-- session per CLAUDE.md Rule 4 ("the agent uses the RLS client exclusively").

create policy agent_rate_limits_all_own on public.agent_rate_limits
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and gym_id = (select private.my_gym_id()));
