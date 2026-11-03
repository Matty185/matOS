-- P1 (flow audit 9.1): free-trial requests from a public link.
--
-- Choices confirmed with the user (2026-11-03):
-- * Visitors request a trial class (pick an upcoming session, or "not
--   sure"); nothing is booked automatically. Coaches follow up.
-- * One public link per gym (/trial/<code>), for the website, socials or a
--   poster. The owner turns it on/off or changes the code.
-- * "Add as member" converts a lead with the details pre-filled.
--
-- gyms.trial_code: NULL = link off. NOT a secret: it is published on the
-- gym's website and any member can read it (gyms_select_member). It is
-- random, server-generated, so gyms can't be enumerated; changing it kills
-- the old link. The public route only honours it for active kind='gym' gyms.
--
-- trial_leads: written ONLY by the public route with the service role (the
-- visitor has no account; same Rule 4 category as sign-up links). Staff read,
-- update (status, notes, conversion) and delete their gym's leads; nobody
-- else can see them. A lead is a prospect's personal data: the visitor
-- consents to being contacted (consented_at), coaches can delete a lead on
-- request, and erasing a member deletes the lead they converted from.

alter table public.gyms
  add column trial_code text,
  add constraint gyms_trial_code_format check (trial_code is null or trial_code ~ '^[a-z0-9]{12,32}$'),
  add constraint gyms_trial_code_unique unique (trial_code);

create type public.trial_experience as enum ('none', 'some', 'experienced');
create type public.trial_lead_status as enum (
  'new',
  'contacted',
  'booked',
  'attended',
  'converted',
  'not_interested'
);

create table public.trial_leads (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  experience public.trial_experience not null,
  -- A parent asking for their child: first/last_name are the child's,
  -- email/phone and parent_name are the parent's (converting then puts the
  -- parent in the member's parent/emergency-contact fields, not their login).
  for_child boolean not null default false,
  parent_name text,
  -- For rate limiting only: the contact normalised (email without +tag, or
  -- the phone's last 9 digits), and a keyed one-way hash of the sender's IP
  -- (the IP itself is never stored).
  contact_key text not null,
  source_hash text,
  message text,
  -- The session they'd like (nullable: "not sure"). on delete set null: a
  -- class removed later just loses the link; the date stays.
  class_id uuid references public.classes (id) on delete set null,
  session_date date,
  status public.trial_lead_status not null default 'new',
  coach_notes text,
  converted_member_id uuid references public.members (id) on delete set null,
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trial_leads_first_name_len check (char_length(btrim(first_name)) between 1 and 50),
  constraint trial_leads_last_name_len check (char_length(btrim(last_name)) between 1 and 50),
  constraint trial_leads_email_len check (email is null or char_length(email) between 3 and 254),
  constraint trial_leads_phone_len check (phone is null or char_length(phone) between 5 and 30),
  constraint trial_leads_contact check (email is not null or phone is not null),
  constraint trial_leads_message_len check (message is null or char_length(message) <= 500),
  constraint trial_leads_parent check (
    (for_child and parent_name is not null and char_length(btrim(parent_name)) between 2 and 100)
    or (not for_child and parent_name is null)
  ),
  constraint trial_leads_contact_key_len check (char_length(contact_key) between 3 and 260),
  constraint trial_leads_source_hash_len check (source_hash is null or char_length(source_hash) = 64),
  constraint trial_leads_notes_len check (coach_notes is null or char_length(coach_notes) <= 1000),
  -- A chosen class always has its date. (A date without a class is fine: the
  -- class may have been deleted since.)
  constraint trial_leads_session check (class_id is null or session_date is not null),
  -- A linked member means the lead converted. (Converted without a member is
  -- fine: the member may have been erased since.)
  constraint trial_leads_converted check (converted_member_id is null or status = 'converted')
);

-- Coach list (newest first per gym), the public route's per-gym rate limit
-- (created_at window), and FK lookups.
create index trial_leads_gym_created_idx on public.trial_leads (gym_id, created_at desc);
-- Rate-limit lookups (per contact, per sender) within a gym.
create index trial_leads_gym_contact_idx on public.trial_leads (gym_id, contact_key, created_at desc);
create index trial_leads_gym_source_idx on public.trial_leads (gym_id, source_hash, created_at desc);
create index trial_leads_class_idx on public.trial_leads (class_id);
create index trial_leads_converted_member_idx on public.trial_leads (converted_member_id);

-- Staff edits: only status, notes and the conversion link change, and the
-- converted member must be in the lead's gym. SECURITY INVOKER on purpose
-- (like gyms_owner_column_guard): current_user must be the caller's role,
-- which a SECURITY DEFINER function would replace with its owner. The member
-- lookup then runs under the caller's RLS, so a member of another gym reads
-- as missing and is refused.
create or replace function public.trial_leads_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  m_gym uuid;
begin
  if current_user in ('authenticated', 'anon') and (
    new.id is distinct from old.id
    or new.gym_id is distinct from old.gym_id
    or new.first_name is distinct from old.first_name
    or new.last_name is distinct from old.last_name
    or new.email is distinct from old.email
    or new.phone is distinct from old.phone
    or new.experience is distinct from old.experience
    or new.for_child is distinct from old.for_child
    or new.parent_name is distinct from old.parent_name
    or new.contact_key is distinct from old.contact_key
    or new.source_hash is distinct from old.source_hash
    or new.message is distinct from old.message
    or new.class_id is distinct from old.class_id
    or new.session_date is distinct from old.session_date
    or new.consented_at is distinct from old.consented_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'only status, notes and conversion can change' using errcode = '42501';
  end if;
  if new.converted_member_id is not null
     and new.converted_member_id is distinct from old.converted_member_id then
    select gym_id into m_gym from public.members where id = new.converted_member_id;
    if m_gym is distinct from new.gym_id then
      raise exception 'converted member must be in this gym' using errcode = '22023';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger trial_leads_guard_update
  before update on public.trial_leads
  for each row execute function public.trial_leads_guard_update();

-- The chosen class must be one of the lead's gym's classes (the public route
-- checks too; this holds even for a service-role insert).
create or replace function public.trial_leads_check_class()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.class_id is not null and not exists (
    select 1 from public.classes c where c.id = new.class_id and c.gym_id = new.gym_id
  ) then
    raise exception 'class is not this gym''s' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.trial_leads_check_class() from public, anon, authenticated;

create trigger trial_leads_check_class
  before insert or update of class_id, gym_id on public.trial_leads
  for each row execute function public.trial_leads_check_class();

alter table public.trial_leads enable row level security;

create policy trial_leads_select_staff on public.trial_leads
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy trial_leads_update_staff on public.trial_leads
  for update to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy trial_leads_delete_staff on public.trial_leads
  for delete to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

-- No INSERT policy: only the public route (service role) creates leads.
revoke all on public.trial_leads from anon;
revoke truncate, insert on public.trial_leads from authenticated;
-- Staff may change only status, notes and the conversion link (the guard
-- trigger also enforces this, and keeps updated_at current).
revoke update on public.trial_leads from authenticated;
grant update (status, coach_notes, converted_member_id) on public.trial_leads to authenticated;
