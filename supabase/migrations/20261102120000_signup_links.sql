-- Stage O7 — self-serve sign-up links.
--
-- A coach mints a one-time link that is NOT tied to a pre-created member
-- row: whoever opens it fills in their own name, email, current rank and
-- password, and the member row is created at that moment. Complements the
-- existing per-member invites (coach pre-fills everything) rather than
-- replacing them.
--
-- Separate table rather than making invites.member_id nullable: a dozen
-- code paths (claim route, GDPR sweeps, the role-change expiry, audit
-- formatting, the members-page sign-up status) rely on every invite
-- pointing at a member. A new table leaves all of them untouched.
--
-- Security model:
-- - Athlete role only. Staff accounts still come only from owner-minted
--   per-person invites (Stage O4/O5 rule) — an open link can never create a
--   coach.
-- - Raw token never stored (sha256 in token_hash), 7-day expiry, single use,
--   bounded attempts — same shape as invites.
-- - No client write policy at all: minting/revoking go through API routes
--   with the service-role client (CLAUDE.md Rule 4, invite generation).
--   Staff may SELECT their own gym's links (the "unused links" list).
-- - Redemption is one SECURITY DEFINER function, executable by service_role
--   only, that locks the link row, re-checks it, and creates member +
--   starting rank + consent + marks the link used in a single transaction —
--   two people racing the same link can't both get in.

create table public.signup_links (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_member_id uuid references public.members (id) on delete set null,
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index signup_links_gym_id_idx on public.signup_links (gym_id);
create index signup_links_created_by_idx on public.signup_links (created_by);
create index signup_links_used_by_member_id_idx on public.signup_links (used_by_member_id);

alter table public.signup_links enable row level security;

create policy signup_links_select_staff on public.signup_links
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

-- Atomic attempt counter (same reasoning as increment_invite_attempt).
create or replace function public.increment_signup_link_attempt(p_link_id uuid)
returns int
language sql
security definer
set search_path = ''
as $$
  update public.signup_links set attempt_count = attempt_count + 1
  where id = p_link_id returning attempt_count;
$$;

revoke execute on function public.increment_signup_link_attempt(uuid) from public, anon, authenticated;
grant execute on function public.increment_signup_link_attempt(uuid) to service_role;

-- p_details keys: first_name, last_name, email, phone, emergency_contact_name,
-- emergency_contact_phone, belt, stripes. Validated by Zod in the route
-- first; this function enforces what must hold regardless of caller.
-- Errors carry a hint the route maps to a friendly message:
--   LINK_UNAVAILABLE  used / expired / gym not a real active gym
--   EMAIL_IN_GYM      someone with this email is already on the roster
--   ALREADY_MEMBER    this account already belongs to the gym
create or replace function public.redeem_signup_link(
  p_link_id uuid,
  p_user_id uuid,
  p_details jsonb,
  p_consent_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.signup_links%rowtype;
  v_gym public.gyms%rowtype;
  v_email text := lower(btrim(p_details->>'email'));
  v_belt public.belt_color := coalesce(nullif(p_details->>'belt', ''), 'white')::public.belt_color;
  v_stripes smallint := coalesce(nullif(p_details->>'stripes', '')::smallint, 0);
  v_today date;
  v_member_id uuid;
begin
  select * into v_link from public.signup_links where id = p_link_id for update;
  if not found or v_link.used_at is not null or v_link.expires_at <= now() then
    raise exception 'sign-up link unavailable' using errcode = 'P0001', hint = 'LINK_UNAVAILABLE';
  end if;

  select * into v_gym from public.gyms where id = v_link.gym_id;
  if v_gym.kind <> 'gym' or not v_gym.active then
    raise exception 'sign-up link unavailable' using errcode = 'P0001', hint = 'LINK_UNAVAILABLE';
  end if;

  if exists (select 1 from public.members where gym_id = v_gym.id and user_id = p_user_id) then
    raise exception 'already a member' using errcode = 'P0001', hint = 'ALREADY_MEMBER';
  end if;
  if exists (select 1 from public.members where gym_id = v_gym.id and lower(email) = v_email) then
    raise exception 'email already on roster' using errcode = 'P0001', hint = 'EMAIL_IN_GYM';
  end if;

  v_today := (now() at time zone v_gym.timezone)::date;

  insert into public.members (
    gym_id, user_id, role, first_name, last_name, email, phone,
    emergency_contact_name, emergency_contact_phone, belt, stripes, join_date
  ) values (
    v_gym.id,
    p_user_id,
    'athlete',
    btrim(p_details->>'first_name'),
    btrim(p_details->>'last_name'),
    v_email,
    nullif(btrim(p_details->>'phone'), ''),
    nullif(btrim(p_details->>'emergency_contact_name'), ''),
    nullif(btrim(p_details->>'emergency_contact_phone'), ''),
    v_belt,
    v_stripes,
    v_today
  )
  returning id into v_member_id;

  insert into public.belt_history (member_id, gym_id, belt, stripes, promoted_at, is_initial, notes)
  values (v_member_id, v_gym.id, v_belt, v_stripes, now(), true, 'Starting rank (self-reported at sign-up)');

  insert into public.gdpr_consents (member_id, gym_id, data_storage_consent, consented_at, consent_version)
  values (v_member_id, v_gym.id, true, now(), p_consent_version);

  update public.signup_links
    set used_at = now(), used_by_member_id = v_member_id
    where id = v_link.id;

  return v_member_id;
end;
$$;

revoke execute on function public.redeem_signup_link(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.redeem_signup_link(uuid, uuid, jsonb, text) to service_role;
