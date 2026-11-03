-- P1 (flow audit 4.4): front-desk kiosk / tablet check-in.
--
-- A tablet at the gym door where members (kids included, who have no
-- login) tap their name to check in. The tablet is NOT signed in as a coach:
-- the owner registers it as a kiosk device, and it can then do exactly three
-- things through dedicated /api/kiosk/* routes: read the gym's name and
-- today's sessions, read the active roster as "First L." + belt, and check a
-- member in to a session whose check-in window is open.
--
-- Two secrets, both stored only as sha256:
--   * activation_token_hash: in the one-time setup link the owner opens on
--     the tablet. Valid 24 hours, single use, cleared when used.
--   * device_token_hash: minted at activation and kept in an httpOnly
--     cookie on the tablet. Long-lived until the owner revokes the device.
-- A forwarded setup link therefore can't make a second kiosk once used, and
-- the device key never appears in a URL.
--
-- No client write policies at all: owners mint/revoke through API routes
-- with the service-role client (the invite / sign-up link category of
-- CLAUDE.md Rule 4, see the Decision Log), and the kiosk itself has no auth
-- user. Owners may SELECT their own gym's devices for the Settings list.

alter type public.checked_in_by add value if not exists 'kiosk';
alter type public.initiated_by add value if not exists 'kiosk';

create table public.kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  name text not null,
  activation_token_hash text unique,
  activation_expires_at timestamptz,
  device_token_hash text unique,
  activated_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint kiosk_devices_name_len check (char_length(btrim(name)) between 1 and 50),
  -- Either waiting for activation (activation secret, no device secret) or
  -- activated (device secret, activation secret cleared).
  constraint kiosk_devices_secret_shape check (
    (activated_at is null and device_token_hash is null)
    or (activated_at is not null and device_token_hash is not null and activation_token_hash is null)
  )
);

create index kiosk_devices_gym_id_idx on public.kiosk_devices (gym_id);
create index kiosk_devices_created_by_idx on public.kiosk_devices (created_by);

alter table public.kiosk_devices enable row level security;

create policy kiosk_devices_select_owner on public.kiosk_devices
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_owner()));

revoke all on public.kiosk_devices from authenticated, anon;
-- Owners never need the secret hashes; grant the listing columns only.
grant select (id, gym_id, name, activation_expires_at, activated_at, last_seen_at, revoked_at, created_at)
  on public.kiosk_devices to authenticated;
