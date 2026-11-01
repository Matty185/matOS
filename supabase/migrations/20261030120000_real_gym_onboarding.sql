-- Stage O1 — real-gym onboarding schema (matos_onboarding_plan.md §6).
--
-- A. gyms.timezone — check-in windows and attendance dates were computed in
--    server time (Vercel = UTC). Correct for an Irish gym only between the
--    last Sunday of October and the last Sunday of March. Every time-of-day
--    decision now resolves in the gym's own IANA zone. Default
--    'Europe/Dublin' matches the only real gym this alpha is onboarding.
--    Validated by trigger against pg_timezone_names (IANA names only — see
--    the trigger's own comment for why `at time zone` alone isn't enough).
-- B. gyms.onboarding_completed_at — drives the owner's /setup wizard and the
--    dashboard checklist. Backfilled to now() for every existing gym so
--    Northside and every test/personal gym never see the wizard.
-- C. gyms column guard — gyms_update_owner has always let an owner update
--    *any* column, including `kind` and `active`, via a direct REST call.
--    Flipping a personal workspace to kind='gym' would sidestep the
--    app-level "personal workspaces stay single-member" checks (S2). Owners
--    may now edit only presentation/config columns; kind/active/created_at
--    are service-role only. Pre-existing gap, closed here because this
--    stage is the first to give owners a real gym-settings UI.
-- D. attendance_set_checked_in_date resolves the date in the gym's zone,
--    and only re-derives when checked_in_at itself changes.
-- E. belt_history.is_initial — a member's starting rank when added/imported,
--    so an existing purple belt doesn't have to be "promoted" white→purple
--    (fake promotion row, celebration animation, wrong progress history).
--    Readers treat is_initial rows as "starting rank", never a promotion.
--    Immutable after insert for end-user roles.
-- F. Last-owner guard — a gym can never be left with zero active owners.
--    Deferred constraint trigger (checks the final state at commit). Plus a
--    staff-deactivation guard: only an owner may change `active` on a
--    coach/owner row.
-- G. public.import_members — atomic (single transaction) insert of N member
--    rows plus their starting-rank belt_history rows. SECURITY INVOKER:
--    members_insert_staff / belt_history_insert_staff RLS and the existing
--    enforce_member_role_insert_guard trigger (owner-only for elevated
--    roles) all still apply exactly as for a single insert. Route contract
--    (gate review O1): p_gym_id is always context.gymId, p_role is chosen
--    server-side from a whitelist (athlete/coach) — never from the body.

-- ── A/B. gyms columns ───────────────────────────────────────────────────────
alter table public.gyms
  add column timezone text not null default 'Europe/Dublin',
  add column onboarding_completed_at timestamptz;

update public.gyms set onboarding_completed_at = now() where onboarding_completed_at is null;

create or replace function public.gyms_validate_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- IANA names only (gate review O1): `at time zone` alone also accepts
  -- abbreviations ('IST', 'EST') and POSIX strings ('UTC+3'), which are
  -- fixed offsets with no DST — silently reintroducing the very bug this
  -- column exists to fix, and unparseable by the app's Intl-based code.
  if not exists (
    select 1 from pg_catalog.pg_timezone_names tz where tz.name = new.timezone
  ) then
    raise exception 'unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger gyms_validate_timezone
  before insert or update of timezone on public.gyms
  for each row execute function public.gyms_validate_timezone();

-- ── C. gyms column guard ────────────────────────────────────────────────────
create or replace function public.gyms_owner_column_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Enforced for PostgREST end-user roles only (current_user is set by
  -- PostgREST from the JWT role; this function is SECURITY INVOKER so it
  -- sees that role). Service-role paths (provisioning, seeding, GDPR solo
  -- deletion) are trusted by construction per CLAUDE.md Rule 4.
  if current_user in ('authenticated', 'anon') and (
    new.kind is distinct from old.kind
    or new.active is distinct from old.active
    or new.created_at is distinct from old.created_at
    or new.id is distinct from old.id
  ) then
    raise exception 'gym kind, active and created_at cannot be changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger gyms_owner_column_guard
  before update on public.gyms
  for each row execute function public.gyms_owner_column_guard();

-- ── D. attendance date in gym timezone ──────────────────────────────────────
-- SECURITY DEFINER so the lookup can't be starved by the caller's own gyms
-- RLS. Reads one column of the row's own gym — new.gym_id has already been
-- pinned to the class's gym by attendance_derive_gym_id, which fires first
-- (alphabetical BEFORE-trigger order: derive < set).
create or replace function public.attendance_set_checked_in_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym_tz text;
begin
  select g.timezone into gym_tz from public.gyms g where g.id = new.gym_id;
  new.checked_in_date = (new.checked_in_at at time zone coalesce(gym_tz, 'UTC'))::date;
  return new;
end;
$$;

-- Previously fired on *every* update; now only when the timestamp itself
-- changes, so an unrelated update to a historical (UTC-derived) row, or a
-- later gym timezone change, can't silently re-date it and collide with
-- attendance_no_duplicate_checkin. Existing rows are deliberately not
-- backfilled (Northside differs from UTC only 23:00-24:00 UTC in summer).
drop trigger attendance_set_checked_in_date on public.attendance;
create trigger attendance_set_checked_in_date
  before insert or update of checked_in_at, checked_in_date on public.attendance
  for each row execute function public.attendance_set_checked_in_date();

-- ── E. belt_history.is_initial ──────────────────────────────────────────────
alter table public.belt_history
  add column is_initial boolean not null default false;

-- At most one starting-rank row per member.
create unique index belt_history_one_initial_per_member
  on public.belt_history (member_id) where is_initial;

-- A coach can still *insert* a starting-rank row (bounded to one per member
-- by the index above; staff are a trusted tier). What's blocked is
-- relabelling an existing real promotion as "initial" (or vice versa) to
-- hide it from promotion readers.
create or replace function public.belt_history_is_initial_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.is_initial is distinct from old.is_initial then
    raise exception 'is_initial cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger belt_history_is_initial_immutable
  before update on public.belt_history
  for each row execute function public.belt_history_is_initial_immutable();

-- ── F. last-owner guard + staff-deactivation guard ──────────────────────────
-- Deferred constraint trigger (gate review O1, both reviewers): a BEFORE ROW
-- trigger's exists() sees the statement-start snapshot, so one multi-row
-- UPDATE deactivating every owner would let each row see the others as
-- still active. Checking at commit sees the final state of the whole
-- transaction; the advisory lock (taken *before* the check) serialises
-- concurrent transactions on the same gym, and under READ COMMITTED the
-- post-lock query takes a fresh snapshot.
--
-- Service role is not exempt: no legitimate flow should orphan a gym. The
-- GDPR execute route pre-checks this before any irreversible step, and the
-- deactivate route maps hint LAST_OWNER to a 409.
create or replace function public.members_last_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'gym_owner' and old.active then
    perform pg_advisory_xact_lock(hashtext('members_last_owner'), hashtext(old.gym_id::text));
    if not exists (
      select 1 from public.members m
      where m.gym_id = old.gym_id
        and m.role = 'gym_owner'
        and m.active
    ) then
      raise exception 'a gym must keep at least one active owner'
        using errcode = 'P0001', hint = 'LAST_OWNER';
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger members_last_owner_guard
  after update of role, active on public.members
  deferrable initially deferred
  for each row execute function public.members_last_owner_guard();

-- Pre-existing gap surfaced by the same review: enforce_member_role_update_
-- guard only blocks a coach changing *role*; members_update_staff still let
-- a coach deactivate/reactivate an owner or another coach. Team management
-- is owner-only (plan §4), so changing `active` on a non-athlete row now
-- requires the actor to be an owner of that row's gym. Same acting-role
-- lookup shape as the existing guards (scoped to new.gym_id; null for the
-- service role, which stays trusted).
create or replace function public.enforce_staff_active_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_role public.member_role;
begin
  if new.active is distinct from old.active and old.role <> 'athlete' then
    select role into acting_role from public.members
    where user_id = auth.uid() and gym_id = new.gym_id;
    if acting_role is not null and acting_role <> 'gym_owner' then
      raise exception 'only a gym owner may deactivate or reactivate staff'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger members_staff_active_guard
  before update of active on public.members
  for each row execute function public.enforce_staff_active_guard();

revoke execute on function public.members_last_owner_guard() from public, anon, authenticated;
revoke execute on function public.enforce_staff_active_guard() from public, anon, authenticated;
revoke execute on function public.attendance_set_checked_in_date() from public, anon, authenticated;

-- ── G. import_members ───────────────────────────────────────────────────────
-- p_rows: jsonb array of objects with keys first_name, last_name, email,
-- phone, emergency_contact_name, emergency_contact_phone, belt, stripes,
-- join_date, membership_plan, notes (optional keys may be null/absent).
-- Shape/format validation happens server-side in Zod before this is called
-- (Zod is the validation source of truth); this function enforces only what
-- the database must guarantee regardless of caller: a row cap, the gym
-- being the caller's own (via RLS), and atomicity.
create or replace function public.import_members(
  p_gym_id uuid,
  p_role public.member_role,
  p_rows jsonb
)
returns table (id uuid, email text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r jsonb;
  new_id uuid;
  v_belt public.belt_color;
  v_stripes smallint;
  v_join date;
  v_today date;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'p_rows must be a non-empty array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 300 then
    raise exception 'at most 300 members per import' using errcode = '22023';
  end if;

  -- "Today" in the gym's own zone, not the session's (UTC). A caller
  -- targeting a gym they can't read gets null here and is rejected by
  -- members_insert_staff on the first insert regardless.
  select (pg_catalog.now() at time zone g.timezone)::date into v_today
  from public.gyms g where g.id = p_gym_id;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_belt := coalesce(nullif(r->>'belt', ''), 'white')::public.belt_color;
    v_stripes := coalesce(nullif(r->>'stripes', '')::smallint, 0);
    v_join := coalesce(nullif(r->>'join_date', '')::date, v_today, current_date);

    insert into public.members (
      gym_id, role, first_name, last_name, email, phone,
      emergency_contact_name, emergency_contact_phone,
      membership_plan, notes, belt, stripes, join_date
    ) values (
      p_gym_id,
      p_role,
      r->>'first_name',
      r->>'last_name',
      lower(btrim(r->>'email')),
      nullif(r->>'phone', ''),
      nullif(r->>'emergency_contact_name', ''),
      nullif(r->>'emergency_contact_phone', ''),
      coalesce(nullif(r->>'membership_plan', ''), 'monthly')::public.membership_plan,
      nullif(r->>'notes', ''),
      v_belt,
      v_stripes,
      v_join
    )
    returning members.id into new_id;

    insert into public.belt_history (member_id, gym_id, belt, stripes, promoted_at, is_initial, notes)
    values (new_id, p_gym_id, v_belt, v_stripes, v_join::timestamptz, true, 'Starting rank');

    id := new_id;
    email := lower(btrim(r->>'email'));
    return next;
  end loop;
end;
$$;

revoke execute on function public.import_members(uuid, public.member_role, jsonb) from public, anon;
grant execute on function public.import_members(uuid, public.member_role, jsonb) to authenticated;
