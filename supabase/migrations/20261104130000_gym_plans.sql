-- P2 (flow audit 6.7 + 8.3): membership plans and prices per gym, and a
-- sibling discount.
--
-- members.membership_plan (monthly / comp_team / casual) stays the BILLING
-- TYPE: isBillable, overdue, holds and every existing writer (roster import,
-- sign-up links, add_guardian, the assistant) keep using it unchanged.
-- gym_plans adds the gym's own named plans on top ("Adults monthly",
-- "Kids monthly", "Student", "10-class card"…), each of one billing type and
-- with an optional price. members.plan_id points at one; a trigger keeps the
-- two columns consistent in both directions:
-- * plan_id set or changed  -> membership_plan := the plan's type
-- * plan_id left alone but membership_plan set/changed (old writers)
--                           -> plan_id := the gym's first active plan of
--                              that type (or NULL if it has none)
--
-- Prices are guidance for recording payments (the payment dialog pre-fills
-- them); nothing is charged. No payment processing (out of scope, 6.6).
--
-- gyms.sibling_discount_percent: applied by the app to the second and later
-- billable children who share a parent account (member_guardians, 8.2).

-- ── gym_plans ───────────────────────────────────────────────────────────────
create table public.gym_plans (
  id uuid primary key default gen_random_uuid(),
  -- Cascade: plans mean nothing without the gym (provisioning rollback
  -- deletes a just-created gym); members.plan_id RESTRICT still protects a
  -- gym that has members on a plan.
  gym_id uuid not null references public.gyms (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind public.membership_plan not null,
  -- Monthly fee for monthly/comp_team plans, per class for casual. NULL =
  -- no price set.
  price numeric(10, 2) check (price is null or (price >= 0 and price <= 100000)),
  active boolean not null default true,
  sort_order smallint not null default 0 check (sort_order between 0 and 1000),
  created_at timestamptz not null default now()
);

create unique index gym_plans_name_unique on public.gym_plans (gym_id, lower(btrim(name)));
create index gym_plans_gym_kind_idx on public.gym_plans (gym_id, kind, sort_order);

alter table public.gym_plans enable row level security;

-- Everyone in the gym can read its plans (athletes see their plan's name on
-- Home; prices are the gym's public prices).
create policy gym_plans_select_member on public.gym_plans
  for select to authenticated
  using (gym_id = (select private.my_gym_id()));

create policy gym_plans_insert_owner on public.gym_plans
  for insert to authenticated
  with check (
    gym_id = (select private.my_gym_id()) and (select private.is_owner())
    and exists (select 1 from public.gyms g where g.id = (select private.my_gym_id()) and g.kind = 'gym')
  );

create policy gym_plans_update_owner on public.gym_plans
  for update to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_owner()));

-- No deletes: a plan members were on is part of their payment history.
-- Retire it with active = false. The type is fixed once created (members on
-- it were billed by that type); make a new plan instead.
revoke all on public.gym_plans from anon;
revoke delete, truncate on public.gym_plans from authenticated;
revoke update on public.gym_plans from authenticated, anon;
grant update (name, price, active, sort_order) on public.gym_plans to authenticated;

-- ── defaults for every real gym (existing and future) ───────────────────────
create or replace function public.gym_plans_seed_defaults(p_gym_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.gym_plans (gym_id, name, kind, sort_order)
  values
    (p_gym_id, 'Monthly', 'monthly', 10),
    (p_gym_id, 'Competition team', 'comp_team', 20),
    (p_gym_id, 'Pay per class', 'casual', 30)
  on conflict do nothing;
$$;

revoke all on function public.gym_plans_seed_defaults(uuid) from public, anon, authenticated;

create or replace function public.gyms_seed_plans()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'gym' then
    perform public.gym_plans_seed_defaults(new.id);
  end if;
  return null;
end;
$$;

revoke all on function public.gyms_seed_plans() from public, anon, authenticated;

create trigger gyms_seed_plans
  after insert on public.gyms
  for each row execute function public.gyms_seed_plans();

select public.gym_plans_seed_defaults(id) from public.gyms where kind = 'gym';

-- ── members.plan_id ─────────────────────────────────────────────────────────
alter table public.members
  add column plan_id uuid references public.gym_plans (id) on delete restrict;

create index members_plan_id_idx on public.members (plan_id);

create or replace function public.members_plan_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p_gym uuid;
  p_kind public.membership_plan;
  p_active boolean;
begin
  if new.plan_id is not null
     and (tg_op = 'INSERT' or new.plan_id is distinct from old.plan_id) then
    select gym_id, kind, active into p_gym, p_kind, p_active
    from public.gym_plans where id = new.plan_id;
    if p_gym is null or p_gym <> new.gym_id then
      raise exception 'plan must belong to the member''s gym' using errcode = '22023';
    end if;
    if not p_active then
      raise exception 'that plan is no longer offered' using errcode = '22023';
    end if;
    new.membership_plan := p_kind;
  elsif tg_op = 'INSERT'
     or new.membership_plan is distinct from old.membership_plan
     or (new.plan_id is null and old.plan_id is not null) then
    select id into new.plan_id
    from public.gym_plans
    where gym_id = new.gym_id and kind = new.membership_plan and active
    order by sort_order, created_at, id
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function public.members_plan_sync() from public, anon, authenticated;

create trigger members_plan_sync
  before insert or update of plan_id, membership_plan on public.members
  for each row execute function public.members_plan_sync();

-- Backfill: everyone gets the default plan of their current billing type.
update public.members m
set plan_id = (
  select p.id from public.gym_plans p
  where p.gym_id = m.gym_id and p.kind = m.membership_plan and p.active
  order by p.sort_order, p.created_at, p.id
  limit 1
)
where m.plan_id is null;

-- Athletes and parents can't move themselves to another (cheaper) plan of
-- the same type: add plan_id to the self-update guard. photo_url too: it
-- now holds a storage path that staff set (flow audit 2.6).
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
      or new.plan_id is distinct from old.plan_id
      or new.photo_url is distinct from old.photo_url
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

-- ── sibling discount ────────────────────────────────────────────────────────
alter table public.gyms
  add column sibling_discount_percent smallint not null default 0
    check (sibling_discount_percent between 0 and 90);
