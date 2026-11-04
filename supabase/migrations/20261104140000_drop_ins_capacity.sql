-- P2 (flow audit 4.6 + 3.5): drop-in visitors, and class capacity.
--
-- A. drop_in_visits — a visitor (from another gym, travelling, a one-off
--    class) recorded by a coach against a class and date: name, optional
--    home gym / belt / contact, the mat fee and whether it was paid, and
--    whether they agreed to the gym's waiver (typed name on the coach's
--    device, or paper). Visitors are not members: no login, no member row,
--    no access to anything. Staff only. Kept 12 months: each new visit
--    recorded deletes the gym's visits older than that (the app's
--    opportunistic purge, like trial requests' sender hashes); a coach can
--    delete one sooner, e.g. when the visitor asks.
--
-- B. gyms.drop_in_fee — the gym's usual mat fee, pre-filled in the form.
--
-- C. Capacity. classes.max_capacity has existed since Stage 1 but was only
--    shown to coaches. Now:
--    * class_headcounts(date): how many are in each of the caller's gym's
--      classes that day (check-ins + visitors). Counts only, so athletes and
--      parents can see "12 / 20" without reading anyone's attendance.
--    * attendance_capacity: a member-initiated check-in (self, parent,
--      kiosk) is refused once a session is full. Coaches marking someone
--      present and coaches adding visitors are never blocked (their call).
--      A per-session advisory lock makes the count exact under concurrency,
--      and it applies to direct REST inserts too, not just the routes.

-- ── A/B ─────────────────────────────────────────────────────────────────────
alter table public.gyms
  add column drop_in_fee numeric(10, 2)
    check (drop_in_fee is null or (drop_in_fee >= 0 and drop_in_fee <= 10000));

create table public.drop_in_visits (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  class_id uuid references public.classes (id) on delete set null,
  visit_date date not null,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 100),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 100),
  home_gym text check (home_gym is null or char_length(home_gym) <= 120),
  belt public.belt_color,
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 30),
  fee numeric(10, 2) check (fee is null or (fee >= 0 and fee <= 10000)),
  fee_paid boolean not null default false,
  waiver_method text not null default 'none'
    check (waiver_method in ('none', 'typed', 'paper')),
  waiver_version_id uuid references public.waiver_versions (id) on delete restrict,
  waiver_signer_name text check (waiver_signer_name is null or char_length(waiver_signer_name) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- "typed" needs the name typed and the waiver version agreed to.
  constraint drop_in_waiver_typed check (
    waiver_method <> 'typed'
    or (waiver_version_id is not null and char_length(btrim(coalesce(waiver_signer_name, ''))) >= 2)
  )
);

create index drop_in_visits_gym_date_idx on public.drop_in_visits (gym_id, visit_date desc);
create index drop_in_visits_class_date_idx on public.drop_in_visits (class_id, visit_date);
create index drop_in_visits_created_by_idx on public.drop_in_visits (created_by);
create index drop_in_visits_waiver_version_idx on public.drop_in_visits (waiver_version_id);

create trigger drop_in_visits_created_by_self
  before insert on public.drop_in_visits
  for each row execute function public.enforce_created_by_self();

-- gym_id from the class when there is one; the class and the waiver
-- version must belong to the same gym.
create or replace function public.drop_in_visits_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_gym uuid;
  w_gym uuid;
begin
  if new.class_id is not null then
    select gym_id into c_gym from public.classes where id = new.class_id;
    if c_gym is null then
      raise exception 'class not found' using errcode = '22023';
    end if;
    if tg_op = 'INSERT' then
      new.gym_id := c_gym;
    elsif c_gym <> new.gym_id then
      raise exception 'class must belong to the visit''s gym' using errcode = '22023';
    end if;
  end if;
  -- Same per-session lock as attendance_zz_capacity, so a visitor and a
  -- member check-in landing together are counted in order.
  if tg_op = 'INSERT' and new.class_id is not null then
    perform pg_advisory_xact_lock(hashtext('class_session:' || new.class_id::text || ':' || new.visit_date::text));
  end if;
  if new.waiver_version_id is not null then
    select gym_id into w_gym from public.waiver_versions where id = new.waiver_version_id;
    if w_gym is distinct from new.gym_id then
      raise exception 'waiver must belong to the visit''s gym' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.drop_in_visits_check() from public, anon, authenticated;

create trigger drop_in_visits_check
  before insert or update of class_id, waiver_version_id on public.drop_in_visits
  for each row execute function public.drop_in_visits_check();

alter table public.drop_in_visits enable row level security;

create policy drop_in_visits_select_staff on public.drop_in_visits
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy drop_in_visits_insert_staff on public.drop_in_visits
  for insert to authenticated
  with check (
    gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner())
    and exists (select 1 from public.gyms g where g.id = (select private.my_gym_id()) and g.kind = 'gym')
  );

create policy drop_in_visits_update_staff on public.drop_in_visits
  for update to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy drop_in_visits_delete_staff on public.drop_in_visits
  for delete to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

revoke truncate on public.drop_in_visits from authenticated, anon;
revoke all on public.drop_in_visits from anon;
-- Only the fee can be changed afterwards (paid later, or corrected).
revoke update on public.drop_in_visits from authenticated;
grant update (fee, fee_paid) on public.drop_in_visits to authenticated;

-- ── C. capacity ─────────────────────────────────────────────────────────────
-- The headcount filters attendance by (class_id, checked_in_date) while
-- holding the session lock; the single-column class index is redundant.
create index attendance_class_date_idx on public.attendance (class_id, checked_in_date);
drop index if exists public.attendance_class_id_idx;

create or replace function public.session_headcount(p_class_id uuid, p_date date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::int from public.attendance a
      where a.class_id = p_class_id and a.checked_in_date = p_date)
    + (select count(*)::int from public.drop_in_visits v
      where v.class_id = p_class_id and v.visit_date = p_date);
$$;

revoke all on function public.session_headcount(uuid, date) from public, anon, authenticated;

-- Counts for the caller's own gym only (my_gym_id() requires an active
-- membership), so anyone in the gym can see how full a class is.
create or replace function public.class_headcounts(p_date date)
returns table (class_id uuid, headcount integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, public.session_headcount(c.id, p_date)
  from public.classes c
  where c.gym_id = (select private.my_gym_id());
$$;

revoke all on function public.class_headcounts(date) from public, anon;
grant execute on function public.class_headcounts(date) to authenticated;

-- Runs after attendance_derive_gym_id and attendance_set_checked_in_date
-- (BEFORE triggers fire in name order), so checked_in_date is final.
create or replace function public.attendance_zz_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap smallint;
begin
  if new.checked_in_by = 'coach' then
    return new;
  end if;
  select max_capacity into cap from public.classes where id = new.class_id;
  if cap is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('class_session:' || new.class_id::text || ':' || new.checked_in_date::text));
  -- Already in: let the unique key report the duplicate, not "full".
  if exists (
    select 1 from public.attendance a
    where a.member_id = new.member_id and a.class_id = new.class_id
      and a.checked_in_date = new.checked_in_date
  ) then
    return new;
  end if;
  if public.session_headcount(new.class_id, new.checked_in_date) >= cap then
    raise exception 'this class is full' using errcode = 'MF001';
  end if;
  return new;
end;
$$;

revoke all on function public.attendance_zz_capacity() from public, anon, authenticated;

create trigger attendance_zz_capacity
  before insert on public.attendance
  for each row execute function public.attendance_zz_capacity();
