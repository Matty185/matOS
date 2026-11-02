-- P0 (flow audit 8.1): members without their own email.
--
-- Kids classes: a child often has no email, and siblings share a parent's.
-- members.email was NOT NULL and unique per gym, so neither could be added.
-- Email is now optional. A member with no email is roster-only: coaches
-- track their attendance, belts and payments, but they have no login (no
-- invite / sign-up / reset can be issued without an email, enforced in the
-- API routes). Parent details go in the emergency-contact fields.
--
-- members_gym_email_unique (gym_id, email) stays: Postgres treats NULLs as
-- distinct, so any number of email-less members can coexist, while real
-- emails stay unique per gym.
--
-- A claimed member (user_id set) must keep an email: it mirrors their
-- auth login. The check below makes that a database guarantee.

alter table public.members alter column email drop not null;

alter table public.members
  add constraint members_claimed_has_email check (user_id is null or email is not null);

-- Gate review (database-reviewer, LOW): a blank email must be NULL, never
-- '' — otherwise two '' rows collide on the unique constraint and '' would
-- satisfy members_claimed_has_email. Zod already normalises blanks; this
-- covers direct RPC/REST callers (import_members passes '' through).
alter table public.members
  add constraint members_email_not_blank check (email is null or btrim(email) <> '');

-- Gate review (database-reviewer, LOW): `new.email <> old.email` is NULL
-- (not true) when either side is NULL, so the athlete self-update guard
-- would not fire on an email change involving NULL. Not reachable today
-- (an athlete's own row is claimed, so it has an email), but compare
-- null-safely. Body otherwise identical to 20260726120000.
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
  if acting_role = 'athlete' then
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
      raise exception 'athletes may only update their own contact fields';
    end if;
  end if;
  return new;
end;
$$;
