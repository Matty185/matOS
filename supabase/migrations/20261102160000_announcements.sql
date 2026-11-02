-- P1 (flow audit 7.1): gym announcements (closures, seminars, gradings).
--
-- A gym-wide post, written by a coach/owner, shown to every member of the gym
-- (athlete Home, coach Dashboard) until its show_until date (in the gym's
-- timezone; the app filters on it). Deliberately one row per announcement,
-- not a fan-out into `notifications` (one row per recipient): nothing needs
-- per-person delivery state yet, and a broadcast row carries no member data,
-- so there is nothing to add to the GDPR erasure/export sweeps.
--
-- No per-member "dismissed" state, for the same reason: show_until is
-- required and capped, so posts clear themselves. No UPDATE: delete and
-- post again (keeps the audit trail to posted/deleted, like session changes).
--
-- created_by follows invites/signup_links: auth.users, on delete set null,
-- forced to the caller by enforce_created_by_self().

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  title text not null,
  body text,
  show_until date not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint announcements_title_len check (char_length(btrim(title)) between 1 and 100),
  constraint announcements_body_len check (body is null or char_length(btrim(body)) between 1 and 2000),
  -- A loose sanity bound; the route enforces "today .. today + 90 days" in
  -- the gym's timezone.
  constraint announcements_show_until_range check (
    show_until >= (created_at at time zone 'UTC')::date - 1
    and show_until <= (created_at at time zone 'UTC')::date + 91
  )
);

-- Reads are "this gym's posts still showing", newest first.
create index announcements_gym_show_until_idx
  on public.announcements (gym_id, show_until);
create index announcements_created_by_idx on public.announcements (created_by);

create trigger announcements_created_by_self
  before insert on public.announcements
  for each row execute function public.enforce_created_by_self();

alter table public.announcements enable row level security;

create policy announcements_select_gym on public.announcements
  for select to authenticated
  using (gym_id = (select private.my_gym_id()));

create policy announcements_insert_staff on public.announcements
  for insert to authenticated
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy announcements_delete_staff on public.announcements
  for delete to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

-- TRUNCATE bypasses RLS (project-wide revoke, see 20260723190000). No UPDATE
-- policy exists; the revoke makes "delete and post again" explicit.
revoke truncate on public.announcements from authenticated, anon;
revoke update on public.announcements from authenticated, anon;
