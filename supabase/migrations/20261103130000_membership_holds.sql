-- P1 (flow audit 2.4): freeze / hold a membership (injury, travel, holiday).
--
-- Whole months, chosen with the gym (fees are monthly): a hold covers
-- start_month .. end_month inclusive, both stored as the 1st of the month,
-- at most 12 months. A frozen month is never owed — every overdue
-- computation (app layer, lib/payments) treats it like a waived month unless
-- a payment row says it was paid. Check-in is NOT blocked during a hold (the
-- gym's choice): coaches just see an "On hold" badge.
--
-- Deliberately no reason/notes column: "why" is very often an injury, which
-- is health data (GDPR special category) we don't need to hold.
--
-- One row per hold. Coaches/owners create and delete; the only column they
-- can change afterwards is end_month (end a hold early, or extend it) — a
-- column-level UPDATE grant. Holds for one member never overlap (trigger).
-- member_id on delete cascade: a solo workspace's member row can be hard
-- deleted (delete-solo); the gym GDPR route anonymises the member and
-- deletes their holds explicitly.

create table public.membership_holds (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  member_id uuid not null references public.members (id) on delete cascade,
  start_month date not null,
  end_month date not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint membership_holds_first_of_month check (
    extract(day from start_month) = 1 and extract(day from end_month) = 1
  ),
  constraint membership_holds_order check (end_month >= start_month),
  constraint membership_holds_max_span check (end_month < start_month + interval '12 months')
);

-- Reads: a member's holds (profile), and the gym's holds overlapping a
-- month window (grid, dashboard, assistant).
create index membership_holds_member_idx on public.membership_holds (member_id, start_month);
create index membership_holds_gym_end_idx on public.membership_holds (gym_id, end_month);
create index membership_holds_created_by_idx on public.membership_holds (created_by);

create trigger membership_holds_derive_gym_id
  before insert on public.membership_holds
  for each row execute function public.derive_gym_id_from_member();

create trigger membership_holds_created_by_self
  before insert on public.membership_holds
  for each row execute function public.enforce_created_by_self();

-- No two holds of one member overlap. A per-member advisory lock serialises
-- concurrent writes for the same member so the check can't race.
create or replace function public.membership_holds_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('membership_holds:' || new.member_id::text, 0));
  if exists (
    select 1 from public.membership_holds h
    where h.member_id = new.member_id
      and h.id <> new.id
      and h.start_month <= new.end_month
      and h.end_month >= new.start_month
  ) then
    raise exception 'membership hold overlaps another hold for this member'
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

revoke all on function public.membership_holds_no_overlap() from public, anon, authenticated;

create trigger membership_holds_no_overlap
  before insert or update of start_month, end_month on public.membership_holds
  for each row execute function public.membership_holds_no_overlap();

alter table public.membership_holds enable row level security;

create policy membership_holds_select_staff on public.membership_holds
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

-- A member sees their own holds (athlete Home's Membership card).
create policy membership_holds_select_self on public.membership_holds
  for select to authenticated
  using (member_id = (select private.my_member_id()));

create policy membership_holds_insert_staff on public.membership_holds
  for insert to authenticated
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy membership_holds_update_staff on public.membership_holds
  for update to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy membership_holds_delete_staff on public.membership_holds
  for delete to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

-- TRUNCATE bypasses RLS (project-wide revoke, see 20260723190000). Only
-- end_month is ever updated; member, gym and start stay as created.
revoke truncate on public.membership_holds from authenticated, anon;
revoke update on public.membership_holds from authenticated, anon;
grant update (end_month) on public.membership_holds to authenticated;
