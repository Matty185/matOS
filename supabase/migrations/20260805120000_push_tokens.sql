-- MatOS Stage M1 (matos_mobile_plan.md's build-sequence row: "Athlete
-- portal screens + gym teasers + push infra (token registration; no sends
-- yet)"). New table only — no sends wired until Stage M6, this just gives
-- the mobile app somewhere to register an Expo push token once it has one.

create type public.push_platform as enum ('ios', 'android');

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  gym_id uuid not null references public.gyms (id) on delete restrict, -- trigger-derived, see below
  expo_push_token text not null,
  platform public.push_platform not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_member_token_unique unique (member_id, expo_push_token)
);

-- No separate index on member_id alone: push_tokens_member_token_unique's
-- composite btree (member_id, expo_push_token) already serves
-- member_id-only lookups via its leftmost prefix — a standalone copy would
-- be pure write/storage overhead (same reasoning S1's own
-- memberships_user_gym_unique comment gives for the identical case).
create index push_tokens_gym_id_idx on public.push_tokens (gym_id);

-- Deliberately `on delete cascade` on member_id, unlike this schema's
-- dominant `on delete restrict` convention for business/audit records
-- (payments, attendance, belt_history, ...). A push token is disposable,
-- device-local, re-derivable data, not a business record worth protecting.
--
-- This only removes push_tokens from *delete-solo*'s hard-delete sweep,
-- not from every deletion path — the review gate caught that the primary,
-- coach-executed GDPR flow (api/deletion-requests/[id]/execute)
-- *anonymises* the members row in place rather than deleting it (Rule 6),
-- so this FK never fires there. That route now explicitly deletes
-- push_tokens itself, matching attendance/athlete_logs. Corrected here
-- after the first version of this comment claimed cascading meant "nothing
-- to remember here by construction" — true for one deletion path, not the
-- other; don't repeat that mistake for a future table with the same shape.

create trigger push_tokens_derive_gym_id
  before insert or update on public.push_tokens
  for each row execute function public.derive_gym_id_from_member();

create trigger push_tokens_set_updated_at
  before update on public.push_tokens
  for each row execute function public.set_updated_at();

alter table public.push_tokens enable row level security;

-- Self-scoped, full CRUD (register/re-register/unregister own device),
-- mirroring athlete_logs_all_self exactly. The unique constraint is
-- (member_id, expo_push_token), not a bare unique on expo_push_token alone
-- — a shared/reused physical device could in principle end up with rows
-- under more than one member_id if a previous user never signed out before
-- handing it off. That's a real edge case, but Stage M1 sends nothing yet
-- (this is registration-only infra per the plan), so a stale duplicate row
-- has zero observable effect until Stage M6 actually wires up sends —
-- deliberately deferred to be solved there, where staleness/de-duplication
-- first becomes load-bearing, rather than solved speculatively now.
create policy push_tokens_all_self on public.push_tokens
  for all to authenticated
  using (member_id = (select private.my_member_id()))
  with check (member_id = (select private.my_member_id()) and gym_id = (select private.my_gym_id()));
