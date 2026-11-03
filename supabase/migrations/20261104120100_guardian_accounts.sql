-- P1 (flow audit 8.2), part 2 of 2: parent accounts managing children.
--
-- Defaults chosen without the user (they asked for this to be built in one
-- go; recorded in the Decision Log):
-- * A parent is a member of the gym: either a new member with role
--   'guardian' (no training, no fees, no waiver), or an existing member
--   (e.g. a parent who trains, or a coach) linked as a guardian.
-- * member_guardians links a guardian member to a child member (an athlete)
--   in the same gym. A child can have several guardians; a guardian several
--   children. Coaches/owners create and remove links; parents can't.
-- * A guardian can SEE their linked children's member row, attendance, belt
--   history, payments (the app never selects amount), holds and waiver
--   signatures; and can CHECK IN a child (checked_in_by 'guardian') and SIGN
--   the waiver for a child (method 'guardian'). Nothing else: no edits to
--   the child's record, no other members, no staff data.
-- * Access follows the guardian's own active membership
--   (private.my_member_id() requires it), so deactivating the parent's
--   member row cuts their access to the children too.

create table public.member_guardians (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  guardian_member_id uuid not null references public.members (id) on delete cascade,
  child_member_id uuid not null references public.members (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint member_guardians_not_self check (guardian_member_id <> child_member_id),
  constraint member_guardians_unique unique (guardian_member_id, child_member_id)
);

create index member_guardians_child_idx on public.member_guardians (child_member_id);
create index member_guardians_gym_idx on public.member_guardians (gym_id);
create index member_guardians_created_by_idx on public.member_guardians (created_by);

create trigger member_guardians_created_by_self
  before insert on public.member_guardians
  for each row execute function public.enforce_created_by_self();

-- Both members in one gym (gym_id derived from the child), the child an
-- athlete, and no chains (a guardian-role member is never someone's child).
create or replace function public.member_guardians_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_gym uuid;
  c_role public.member_role;
  g_gym uuid;
begin
  select gym_id, role into c_gym, c_role from public.members where id = new.child_member_id;
  select gym_id into g_gym from public.members where id = new.guardian_member_id;
  if c_gym is null or g_gym is null or c_gym <> g_gym then
    raise exception 'guardian and child must be members of the same gym' using errcode = '22023';
  end if;
  if c_role <> 'athlete' then
    raise exception 'only an athlete can have a guardian' using errcode = '22023';
  end if;
  new.gym_id = c_gym;
  return new;
end;
$$;

revoke all on function public.member_guardians_check() from public, anon, authenticated;

create trigger member_guardians_check
  before insert on public.member_guardians
  for each row execute function public.member_guardians_check();

alter table public.member_guardians enable row level security;

create policy member_guardians_select_staff on public.member_guardians
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy member_guardians_select_guardian on public.member_guardians
  for select to authenticated
  using (guardian_member_id = (select private.my_member_id()));

-- A child sees who their own parents are (their data; GDPR export).
create policy member_guardians_select_child on public.member_guardians
  for select to authenticated
  using (child_member_id = (select private.my_member_id()));

create policy member_guardians_insert_staff on public.member_guardians
  for insert to authenticated
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy member_guardians_delete_staff on public.member_guardians
  for delete to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

revoke truncate, update on public.member_guardians from authenticated, anon;

-- The member ids the caller (their current, active membership) is a linked
-- guardian of. Policies use it as `x in (select private.my_child_ids())`,
-- which Postgres evaluates once per query (an initplan), not once per row.
-- SECURITY DEFINER so it can read member_guardians regardless of the
-- caller's own policies; it only ever returns the caller's own links.
create or replace function private.my_child_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.child_member_id
  from public.member_guardians g
  where g.guardian_member_id = private.my_member_id();
$$;

revoke all on function private.my_child_ids() from public, anon;
grant execute on function private.my_child_ids() to authenticated;

-- Read access to a linked child's own data.
create policy members_select_guardian on public.members
  for select to authenticated
  using (id in (select private.my_child_ids()));

create policy attendance_select_guardian on public.attendance
  for select to authenticated
  using (member_id in (select private.my_child_ids()));

create policy belt_history_select_guardian on public.belt_history
  for select to authenticated
  using (member_id in (select private.my_child_ids()));

-- Amount is never selected by the app for parents (CLAUDE.md Rule 3).
create policy payments_select_guardian on public.payments
  for select to authenticated
  using (member_id in (select private.my_child_ids()));

create policy membership_holds_select_guardian on public.membership_holds
  for select to authenticated
  using (member_id in (select private.my_child_ids()));

create policy waiver_signatures_select_guardian on public.waiver_signatures
  for select to authenticated
  using (member_id in (select private.my_child_ids()));

-- Writes: check a child in, and sign the waiver for them.
create policy attendance_insert_guardian on public.attendance
  for insert to authenticated
  with check (
    member_id in (select private.my_child_ids())
    and gym_id = (select private.my_gym_id())
    and checked_in_by = 'guardian'
    -- Not for a deactivated child (the route checks too).
    and exists (select 1 from public.members m where m.id = member_id and m.active)
  );

create policy waiver_signatures_insert_guardian on public.waiver_signatures
  for insert to authenticated
  with check (
    member_id in (select private.my_child_ids())
    and method = 'guardian'
    -- Not for a deactivated child (the route checks too).
    and exists (select 1 from public.members m where m.id = member_id and m.active)
  );

-- Coaches may add guardian-role members (as they add athletes); creating
-- coaches/owners stays owner-only. Same function as before otherwise.
create or replace function public.enforce_member_role_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_role public.member_role;
begin
  select role into acting_role from public.members
  where user_id = auth.uid() and gym_id = new.gym_id;
  if acting_role is not null and acting_role <> 'gym_owner'
     and new.role not in ('athlete', 'guardian') then
    raise exception 'only a gym owner may add a member with an elevated role';
  end if;
  return new;
end;
$$;

-- Coach adds a parent for a child in one transaction: reuse an active member
-- of the same gym with that email, else create a guardian-role member, then
-- link. SECURITY INVOKER: members_insert_staff, member_guardians_insert_staff,
-- the role guard and member_guardians_check all apply exactly as for direct
-- writes. Returns the guardian's member id and whether it was created.
-- (Members can't be deleted by clients, so doing this in two route calls
-- couldn't roll a created member back if the link failed.)
create or replace function public.add_guardian(
  p_child_member_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text
)
returns table (guardian_member_id uuid, created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_gym uuid;
  v_guardian uuid;
  v_active boolean;
  v_created boolean := false;
begin
  if coalesce(btrim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or coalesce(btrim(p_first_name), '') = ''
     or coalesce(btrim(p_last_name), '') = '' then
    raise exception 'a parent needs a first name, last name and email' using errcode = '22023';
  end if;

  select gym_id into v_gym from public.members where id = p_child_member_id;
  if v_gym is null then
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  select m.id, m.active into v_guardian, v_active
  from public.members m
  where m.gym_id = v_gym and lower(m.email) = lower(btrim(p_email))
  order by m.created_at
  limit 1;

  if v_guardian is not null and not v_active then
    raise exception 'that member is inactive' using errcode = '55000';
  end if;

  if v_guardian is null then
    insert into public.members (gym_id, first_name, last_name, email, role)
    values (v_gym, btrim(p_first_name), btrim(p_last_name), lower(btrim(p_email)), 'guardian')
    returning id into v_guardian;
    v_created := true;
  end if;

  insert into public.member_guardians (gym_id, guardian_member_id, child_member_id)
  values (v_gym, v_guardian, p_child_member_id);

  return query select v_guardian, v_created;
end;
$$;

revoke all on function public.add_guardian(uuid, text, text, text) from public, anon;
grant execute on function public.add_guardian(uuid, text, text, text) to authenticated;

-- Security review (8.2): a parent account edits its own row as narrowly as
-- an athlete does (contact fields only) — members_update_self applies to
-- every role. Same function as 20261102130000 with 'guardian' added.
create or replace function public.enforce_member_self_update_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_role public.member_role;
begin
  select role into acting_role from public.members
  where user_id = auth.uid() and gym_id = new.gym_id;
  if acting_role in ('athlete', 'guardian') then
    if new.id <> old.id
      or new.gym_id <> old.gym_id
      or new.user_id is distinct from old.user_id
      or new.role <> old.role
      or new.first_name <> old.first_name
      or new.last_name <> old.last_name
      or new.email is distinct from old.email
      or new.join_date <> old.join_date
      or new.belt <> old.belt
      or new.stripes <> old.stripes
      or new.membership_plan <> old.membership_plan
      or coalesce(new.notes, '') <> coalesce(old.notes, '')
      or new.active <> old.active
      or new.created_at <> old.created_at
    then
      raise exception 'members may only update their own contact fields';
    end if;
  end if;
  return new;
end;
$$;

-- Security review (8.2): a parent account doesn't check itself in (it
-- checks its children in, as 'guardian'). Same policy as 20260715160100
-- plus the role test.
drop policy attendance_insert_self on public.attendance;
create policy attendance_insert_self on public.attendance
  for insert to authenticated
  with check (
    member_id = (select private.my_member_id())
    and gym_id = (select private.my_gym_id())
    and checked_in_by = 'self'
    and (select private.my_role()) <> 'guardian'
  );

-- Security review (8.2): only athletes have parents. If a linked child's
-- role changes (made a coach/owner), their parent links go, so a parent
-- never keeps access to a staff member's row.
create or replace function public.member_guardians_drop_on_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role <> 'athlete' and old.role = 'athlete' then
    delete from public.member_guardians where child_member_id = new.id;
  end if;
  -- A member turned into a parent account can't be anyone's parent-of-
  -- themselves chain either: links where they're the child go too (above),
  -- links where they're the parent stay.
  return new;
end;
$$;

revoke all on function public.member_guardians_drop_on_role_change() from public, anon, authenticated;

create trigger members_drop_guardian_links_on_role_change
  after update of role on public.members
  for each row execute function public.member_guardians_drop_on_role_change();

-- Database review (8.2): coaches create parent accounts, so they may also
-- deactivate/reactivate them; staff rows stay owner-only. Same function as
-- 20261030120000 with 'guardian' treated like 'athlete'.
create or replace function public.enforce_staff_active_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_role public.member_role;
begin
  if new.active is distinct from old.active and old.role not in ('athlete', 'guardian') then
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
