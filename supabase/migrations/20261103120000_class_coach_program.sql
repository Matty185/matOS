-- P1 (flow audit 3.3 + 3.4): who teaches a class, and which programme it
-- belongs to.
--
-- classes.coach_member_id: optional, the member row of a coach or owner of
-- the same gym. A trigger enforces that on insert and whenever it changes
-- (RLS alone can't: classes_update_staff lets a coach write any column).
-- on delete set null — members are normally anonymised, never deleted, but
-- a solo workspace's member row can be, and that must not be blocked.
--
-- classes.program: a fixed list rather than per-gym programmes. The class
-- name still carries the gym's own wording ("Little Grapplers"); program is
-- the category used for badges and filtering. Distinct from class_type
-- (gi / no-gi / comp / open mat), which says what is trained.
--
-- Athletes can't read other members' rows (members RLS), so they can't
-- resolve coach_member_id to a name themselves. class_coach_names() returns
-- just "class id → coach's name" for the caller's gym, for active coaches
-- and owners only — the same names any member sees on the mat.

create type public.class_program as enum (
  'all_levels',
  'fundamentals',
  'advanced',
  'kids',
  'teens',
  'womens'
);

alter table public.classes
  add column coach_member_id uuid references public.members (id) on delete set null,
  add column program public.class_program not null default 'all_levels';

create index classes_coach_member_id_idx on public.classes (coach_member_id);

create or replace function public.classes_check_coach()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_gym uuid;
  c_role public.member_role;
  c_active boolean;
begin
  if new.coach_member_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.coach_member_id is not distinct from old.coach_member_id
     and new.gym_id = old.gym_id then
    return new;
  end if;
  -- for share: a deactivation or demotion can't commit between this check
  -- and the class write.
  select gym_id, role, active into c_gym, c_role, c_active
  from public.members where id = new.coach_member_id
  for share;
  if c_gym is null or c_gym <> new.gym_id then
    raise exception 'coach must be a member of this gym' using errcode = '22023';
  end if;
  if c_role not in ('coach', 'gym_owner') or not c_active then
    raise exception 'coach must be an active coach or owner' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.classes_check_coach() from public, anon, authenticated;

create trigger classes_check_coach
  before insert or update of coach_member_id, gym_id on public.classes
  for each row execute function public.classes_check_coach();

-- class id → coach's display name, for the caller's active gym. SECURITY
-- DEFINER so athletes can read staff names without members SELECT access;
-- scoped by private.my_gym_id(), returns nothing for anyone without an
-- active membership.
create or replace function public.class_coach_names()
returns table (class_id uuid, coach_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, m.first_name || ' ' || m.last_name
  from public.classes c
  join public.members m on m.id = c.coach_member_id
  where c.gym_id = private.my_gym_id()
    and m.gym_id = c.gym_id
    and m.active
    and m.role in ('coach', 'gym_owner');
$$;

revoke all on function public.class_coach_names() from public, anon;
grant execute on function public.class_coach_names() to authenticated;
