-- P1 (flow audit 9.3): liability waivers.
--
-- Choices confirmed with the user (2026-11-03):
-- * The owner writes the waiver; members sign in the app (typed full name +
--   tick). Coaches can also record a paper waiver, or have a parent/guardian
--   sign on the coach's device (roster-only kids have no login).
-- * No medical information: health data is GDPR special category and isn't
--   needed for the waiver itself.
-- * Unsigned members are flagged, never blocked from checking in.
--
-- waiver_versions: one row per published text, numbered per gym, immutable
-- (a signature must always point at exactly the words that were agreed to).
-- The gym's current waiver is its highest version; publishing a new one asks
-- everyone to sign again.
--
-- waiver_signatures: one live row per member per version. method says
-- how it was captured; signer_name is the typed name (the member's own, or
-- the parent/guardian's; optional for paper). created_by is whoever
-- submitted it (the member, or the coach for guardian/paper).
--
-- GDPR: erasure keeps the signature row (it records that a waiver was
-- agreed, which the gym may need to show later) but clears signer_name;
-- the member row itself is anonymised by the execute route.

create table public.waiver_versions (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  version integer not null,
  body text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint waiver_versions_body_len check (char_length(btrim(body)) between 20 and 20000),
  constraint waiver_versions_version_positive check (version >= 1),
  constraint waiver_versions_gym_version_unique unique (gym_id, version)
);

create index waiver_versions_created_by_idx on public.waiver_versions (created_by);

create trigger waiver_versions_created_by_self
  before insert on public.waiver_versions
  for each row execute function public.enforce_created_by_self();

-- Version numbers are assigned here, never by the client: next = max + 1,
-- serialised per gym.
create or replace function public.waiver_versions_assign_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('waiver_versions:' || new.gym_id::text, 0));
  select coalesce(max(v.version), 0) + 1 into new.version
  from public.waiver_versions v
  where v.gym_id = new.gym_id;
  return new;
end;
$$;

revoke all on function public.waiver_versions_assign_version() from public, anon, authenticated;

create trigger waiver_versions_assign_version
  before insert on public.waiver_versions
  for each row execute function public.waiver_versions_assign_version();

alter table public.waiver_versions enable row level security;

-- Every member of the gym can read the waiver (they have to, to sign it).
create policy waiver_versions_select_gym on public.waiver_versions
  for select to authenticated
  using (gym_id = (select private.my_gym_id()));

create policy waiver_versions_insert_owner on public.waiver_versions
  for insert to authenticated
  with check (gym_id = (select private.my_gym_id()) and (select private.is_owner()));

revoke truncate, update, delete on public.waiver_versions from authenticated, anon;

-- A signature must always point at the exact words agreed to, so a version's
-- text never changes — not even through the service role. It can't
-- disappear while anything has signed it either (FK restrict); an unsigned
-- version can only be deleted by the service role (delete-solo).
create or replace function public.waiver_versions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The one allowed change: created_by cleared by its FK (on delete set
  -- null) when the publishing user is deleted (GDPR erasure).
  if new.created_by is null and old.created_by is not null
     and (new.id, new.gym_id, new.version, new.body, new.created_at)
         is not distinct from (old.id, old.gym_id, old.version, old.body, old.created_at) then
    return new;
  end if;
  raise exception 'waiver versions can''t be edited' using errcode = '42501';
end;
$$;

create trigger waiver_versions_immutable
  before update on public.waiver_versions
  for each row execute function public.waiver_versions_immutable();

create type public.waiver_signature_method as enum ('self', 'guardian', 'paper');

create table public.waiver_signatures (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  member_id uuid not null references public.members (id) on delete cascade,
  waiver_version_id uuid not null references public.waiver_versions (id) on delete restrict,
  method public.waiver_signature_method not null,
  signer_name text,
  signed_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  -- A coach can void a record made against the wrong member (or in error);
  -- a voided signature doesn't count and the member can sign again.
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  constraint waiver_signatures_signer_name_len check (
    signer_name is null or char_length(btrim(signer_name)) between 2 and 100
  )
);

-- One live signature per member per version; voided ones don't block a new one.
create unique index waiver_signatures_member_version_live
  on public.waiver_signatures (member_id, waiver_version_id)
  where voided_at is null;
create index waiver_signatures_member_idx on public.waiver_signatures (member_id);
create index waiver_signatures_gym_version_idx on public.waiver_signatures (gym_id, waiver_version_id);
create index waiver_signatures_voided_by_idx on public.waiver_signatures (voided_by);
create index waiver_signatures_version_idx on public.waiver_signatures (waiver_version_id);
create index waiver_signatures_created_by_idx on public.waiver_signatures (created_by);

create trigger waiver_signatures_created_by_self
  before insert on public.waiver_signatures
  for each row execute function public.enforce_created_by_self();

-- gym_id from the member, and the waiver version must be that gym's.
create or replace function public.waiver_signatures_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m_gym uuid;
  v_gym uuid;
begin
  select gym_id into m_gym from public.members where id = new.member_id;
  if m_gym is null then
    raise exception 'member_id does not reference an existing member';
  end if;
  select gym_id into v_gym from public.waiver_versions where id = new.waiver_version_id;
  if v_gym is null or v_gym <> m_gym then
    raise exception 'waiver version is not this member''s gym''s' using errcode = '22023';
  end if;
  -- Only the gym's current waiver can be signed (a superseded version would
  -- leave a misleading record).
  if exists (
    select 1 from public.waiver_versions v
    where v.gym_id = m_gym
      and v.version > (select w.version from public.waiver_versions w where w.id = new.waiver_version_id)
  ) then
    raise exception 'that waiver has been replaced by a newer version' using errcode = '22023';
  end if;
  -- In-app and guardian signatures need a typed name; paper may omit it.
  -- (Checked here, not as a constraint: GDPR erasure later clears the name.)
  if new.method <> 'paper' and new.signer_name is null then
    raise exception 'a signer name is required' using errcode = '23514';
  end if;
  -- The time it was signed is the time it was saved, never client-supplied.
  new.signed_at = now();
  new.voided_at = null;
  new.voided_by = null;
  new.gym_id = m_gym;
  return new;
end;
$$;

revoke all on function public.waiver_signatures_check() from public, anon, authenticated;

create trigger waiver_signatures_check
  before insert on public.waiver_signatures
  for each row execute function public.waiver_signatures_check();

alter table public.waiver_signatures enable row level security;

create policy waiver_signatures_select_staff on public.waiver_signatures
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy waiver_signatures_select_self on public.waiver_signatures
  for select to authenticated
  using (member_id = (select private.my_member_id()));

-- Staff record guardian/paper (or self, on a member's behalf is not
-- allowed: 'self' means the member's own login).
create policy waiver_signatures_insert_staff on public.waiver_signatures
  for insert to authenticated
  with check (
    gym_id = (select private.my_gym_id())
    and (select private.is_coach_or_owner())
    and method in ('guardian', 'paper')
  );

create policy waiver_signatures_insert_self on public.waiver_signatures
  for insert to authenticated
  with check (member_id = (select private.my_member_id()) and method = 'self');

-- Staff may only void (voided_at / voided_by, below). No deletes.
create policy waiver_signatures_update_staff on public.waiver_signatures
  for update to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

revoke truncate, update, delete on public.waiver_signatures from authenticated, anon;
grant update (voided_at, voided_by) on public.waiver_signatures to authenticated;

-- The only changes a signature ever takes: voiding it once (stamped with the
-- caller), and GDPR erasure clearing signer_name (service role). Everything
-- else is fixed, for every role.
create or replace function public.waiver_signatures_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.gym_id is distinct from old.gym_id
     or new.member_id is distinct from old.member_id
     or new.waiver_version_id is distinct from old.waiver_version_id
     or new.method is distinct from old.method
     or new.signed_at is distinct from old.signed_at
     -- created_by may only go to null (its FK, when that user is deleted).
     or (new.created_by is distinct from old.created_by and new.created_by is not null) then
    raise exception 'waiver signatures are immutable' using errcode = '42501';
  end if;
  if new.signer_name is distinct from old.signer_name and new.signer_name is not null then
    raise exception 'signer_name can only be cleared' using errcode = '42501';
  end if;
  if new.voided_at is distinct from old.voided_at then
    if old.voided_at is not null or new.voided_at is null then
      raise exception 'a signature can be voided once and not restored' using errcode = '42501';
    end if;
    new.voided_at = now();
    new.voided_by = auth.uid();
  elsif new.voided_by is distinct from old.voided_by and new.voided_by is not null then
    -- (voided_by going to null is its FK, when the voiding user is deleted.)
    raise exception 'voided_by is set by voiding' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger waiver_signatures_guard_update
  before update on public.waiver_signatures
  for each row execute function public.waiver_signatures_guard_update();

create or replace function public.waiver_signatures_no_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Rows go only with their member (delete-solo's cascade), never alone.
  if exists (select 1 from public.members m where m.id = old.member_id) then
    raise exception 'waiver signatures are kept; void one instead' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger waiver_signatures_no_delete
  before delete on public.waiver_signatures
  for each row execute function public.waiver_signatures_no_delete();
