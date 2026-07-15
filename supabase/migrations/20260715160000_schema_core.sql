-- MatOS Stage 1: core schema (enums, tables, constraints, indexes).
-- RLS, helper functions, and triggers live in the companion migration
-- 20260715160100_rls_and_functions.sql — kept separate so schema shape and
-- access-control logic can be reviewed independently.
--
-- Design notes (for the Stage 1 review gate, see docs/stage-1-notes.md for
-- the full rationale on anything flagged "not explicit in project plan"):
--
-- 1. `members.role` (gym_owner|coach|athlete) is an addition: the project
--    plan's members column list (§3) doesn't include a role column, but §4's
--    RLS table is written entirely in terms of role, so a role signal has to
--    live somewhere. Folding it into `members` (rather than a separate
--    coaches/roles table) matches CLAUDE.md's "belt rendering... in the same
--    member list" framing — coaches/owners are gym members too.
-- 2. `gdpr_consents.gym_id` and `agent_rate_limits.gym_id` are additions
--    beyond the plan's minimal column list, added to satisfy CLAUDE.md
--    Architecture Rule 1 ("every tenant table has gym_id, FK, indexed").
-- 3. `invites.attempt_count` is an addition required to enforce the
--    documented "5-attempt limit" (§5) atomically at the DB layer.
-- 4. Deletes are disabled per CLAUDE.md Rule 6 by simply not granting DELETE
--    policies where the plan says "DELETE disabled" — enforced in the RLS
--    migration, not here.
-- 5. `gym_id` on the member-referencing tables (belt_history, attendance,
--    payments, analyses, athlete_logs, gdpr_consents, invites,
--    deletion_requests) is trigger-derived from `member_id` (and, for
--    attendance, cross-validated against `class_id`) in the RLS migration —
--    not trusted as client-supplied input. Found in review: nothing
--    previously stopped a coach's insert from pairing a correct `gym_id`
--    with a `member_id` belonging to a different gym.
-- 6. `belt_history.promoted_by` is nullable with `on delete set null` (not
--    `not null` / `on delete restrict` as originally written) — found in
--    review: `restrict` would have permanently blocked deleting any coach's
--    auth.users row once they had ever promoted a member.

-- ── Enums ─────────────────────────────────────────────────────────────────

create type public.member_role as enum ('gym_owner', 'coach', 'athlete');

create type public.belt_color as enum (
  'white',
  'grey_white', 'grey', 'grey_black',
  'yellow_white', 'yellow', 'yellow_black',
  'orange_white', 'orange', 'orange_black',
  'green_white', 'green', 'green_black',
  'blue', 'purple', 'brown', 'black'
);

create type public.membership_plan as enum ('monthly', 'casual', 'comp_team');

create type public.class_type as enum ('gi', 'no_gi', 'comp', 'open_mat');

create type public.checked_in_by as enum ('self', 'coach');

create type public.payment_status as enum ('paid', 'unpaid', 'waived');

create type public.analysis_status as enum ('pending', 'complete', 'failed');

create type public.initiated_by as enum ('coach_manual', 'agent');

-- ── gyms ──────────────────────────────────────────────────────────────────

create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  contact_email text,
  logo_url text,
  created_at timestamptz not null default now(),
  active boolean not null default true
);

-- ── members ───────────────────────────────────────────────────────────────

create table public.members (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  user_id uuid unique references auth.users (id) on delete set null,
  role public.member_role not null default 'athlete',
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  photo_url text,
  join_date date not null default current_date,
  belt public.belt_color not null default 'white',
  stripes smallint not null default 0 check (stripes between 0 and 4),
  membership_plan public.membership_plan not null default 'monthly',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_gym_email_unique unique (gym_id, email)
);

create index members_gym_id_idx on public.members (gym_id);
create index members_gym_active_idx on public.members (gym_id, active);
create index members_user_id_idx on public.members (user_id);

-- ── belt_history ──────────────────────────────────────────────────────────

create table public.belt_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete restrict,
  gym_id uuid not null references public.gyms (id) on delete restrict,
  belt public.belt_color not null,
  stripes smallint not null default 0 check (stripes between 0 and 4),
  promoted_at timestamptz not null default now(),
  promoted_by uuid references auth.users (id) on delete set null,
  notes text
);

create index belt_history_member_id_idx on public.belt_history (member_id);
create index belt_history_gym_id_idx on public.belt_history (gym_id);
create index belt_history_promoted_by_idx on public.belt_history (promoted_by);

-- ── classes ───────────────────────────────────────────────────────────────
-- Template model per CLAUDE.md Rule 7 (known simplification; per-session
-- refactor planned post-alpha). "Deleting" a class in the UI should mean
-- active = false — the FK from attendance (on delete restrict) makes a hard
-- delete impossible once a class has any attendance history anyway, which is
-- the desired behaviour without inventing a separate soft-delete rule.

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  name text not null,
  class_type public.class_type not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  duration_minutes smallint not null check (duration_minutes > 0),
  max_capacity smallint check (max_capacity is null or max_capacity > 0),
  active boolean not null default true
);

create index classes_gym_id_idx on public.classes (gym_id);
create index classes_gym_day_idx on public.classes (gym_id, day_of_week);

-- ── attendance ────────────────────────────────────────────────────────────
-- checked_in_date is derived from checked_in_at (never entered directly) so
-- a unique constraint can prevent a member double-checking-in to the same
-- class on the same day at the DB layer, backing up the "already checked in"
-- UX rule in the plan. Kept via a BEFORE INSERT/UPDATE trigger (companion
-- migration) rather than GENERATED ALWAYS AS ... STORED: the natural
-- expression (`checked_in_at at time zone 'utc'`, or a plain `::date` cast)
-- depends on timezone conversion, which Postgres classifies STABLE, not
-- IMMUTABLE — generated columns require an immutable expression, so either
-- form would fail at migration time. A trigger has no such restriction and
-- additionally derives the correct date for backdated check-ins (a coach
-- logging historical attendance with a past checked_in_at).

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete restrict,
  class_id uuid not null references public.classes (id) on delete restrict,
  gym_id uuid not null references public.gyms (id) on delete restrict,
  checked_in_at timestamptz not null default now(),
  checked_in_by public.checked_in_by not null,
  checked_in_date date not null,
  constraint attendance_no_duplicate_checkin unique (member_id, class_id, checked_in_date)
);

create index attendance_member_id_idx on public.attendance (member_id);
create index attendance_class_id_idx on public.attendance (class_id);
create index attendance_gym_id_idx on public.attendance (gym_id);
create index attendance_gym_checked_in_at_idx on public.attendance (gym_id, checked_in_at);
create index attendance_gym_checked_in_date_idx on public.attendance (gym_id, checked_in_date);

-- ── payments ──────────────────────────────────────────────────────────────
-- `amount` is nullable and readable via RLS to any coach in-gym or the
-- owning athlete at the DB layer — the plan's "amount hidden from athletes"
-- rule is the *second* of its stated two layers ("RLS + server-side filter,
-- two layers"). RLS enforces row ownership; stripping `amount` from athlete
-- API responses is a Stage 2 API-route concern (Postgres RLS is row-scoped,
-- not column-scoped, and column-level GRANT/REVOKE isn't usable here since
-- coach and athlete share the same `authenticated` Postgres role). Flagged
-- prominently for the Stage 1 review gate and for Stage 2 to pick up.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete restrict,
  gym_id uuid not null references public.gyms (id) on delete restrict,
  period_month smallint not null check (period_month between 1 and 12),
  period_year smallint not null check (period_year >= 2000),
  amount numeric(10, 2) check (amount is null or amount >= 0),
  status public.payment_status not null default 'unpaid',
  paid_at timestamptz,
  notes text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payments_member_period_unique unique (member_id, period_month, period_year)
);

create index payments_gym_id_idx on public.payments (gym_id);
create index payments_member_id_idx on public.payments (member_id);
create index payments_gym_status_idx on public.payments (gym_id, status);
create index payments_gym_period_idx on public.payments (gym_id, period_year, period_month);
create index payments_recorded_by_idx on public.payments (recorded_by);

-- ── audit_log ─────────────────────────────────────────────────────────────
-- Immutability (CLAUDE.md: "Audit log is immutable") is enforced twice: no
-- UPDATE/DELETE RLS policy is ever granted (next migration), and a trigger
-- (next migration) blocks DELETE outright and blocks UPDATE except for
-- nulling actor_id (needed for the auth.users ON DELETE SET NULL cascade
-- below, and for plan §7's "audit retained with actor anonymised" GDPR
-- step) — triggers fire regardless of RLS bypass, so this also constrains
-- the service-role client, not just ordinary authenticated users.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  "timestamp" timestamptz not null default now(),
  initiated_by public.initiated_by not null default 'coach_manual',
  agent_query text
);

create index audit_log_gym_id_idx on public.audit_log (gym_id);
create index audit_log_gym_timestamp_idx on public.audit_log (gym_id, "timestamp" desc);
create index audit_log_gym_actor_idx on public.audit_log (gym_id, actor_id);

-- ── analyses (video analysis stubs — no video ever stored) ──────────────────

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete restrict,
  gym_id uuid not null references public.gyms (id) on delete restrict,
  title text not null,
  analysed_at timestamptz,
  status public.analysis_status not null default 'pending',
  report jsonb,
  created_by uuid references auth.users (id) on delete set null,
  visible_to_athlete boolean not null default true,
  created_at timestamptz not null default now()
);

create index analyses_member_id_idx on public.analyses (member_id);
create index analyses_gym_id_idx on public.analyses (gym_id);
create index analyses_created_by_idx on public.analyses (created_by);

-- ── athlete_logs ──────────────────────────────────────────────────────────

create table public.athlete_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete restrict,
  gym_id uuid not null references public.gyms (id) on delete restrict,
  entry_date date not null default current_date,
  working_on text,
  struggling_with text,
  notes text,
  visible_to_coach boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index athlete_logs_member_id_idx on public.athlete_logs (member_id);
create index athlete_logs_gym_id_idx on public.athlete_logs (gym_id);

-- ── gdpr_consents ─────────────────────────────────────────────────────────

create table public.gdpr_consents (
  member_id uuid primary key references public.members (id) on delete restrict,
  gym_id uuid not null references public.gyms (id) on delete restrict,
  data_storage_consent boolean not null default false,
  consented_at timestamptz,
  consent_version text not null
);

create index gdpr_consents_gym_id_idx on public.gdpr_consents (gym_id);

-- ── invites ───────────────────────────────────────────────────────────────

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete restrict,
  gym_id uuid not null references public.gyms (id) on delete restrict,
  token_hash text not null unique,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index invites_gym_id_idx on public.invites (gym_id);
create index invites_member_id_idx on public.invites (member_id);
create index invites_created_by_idx on public.invites (created_by);

-- ── notifications (infrastructure only — no UI in alpha) ─────────────────

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  payload jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_gym_id_idx on public.notifications (gym_id);
create index notifications_recipient_read_idx on public.notifications (recipient_user_id, read);

-- ── deletion_requests (GDPR) ──────────────────────────────────────────────

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete restrict,
  gym_id uuid not null references public.gyms (id) on delete restrict,
  requested_at timestamptz not null default now(),
  executed_at timestamptz,
  executed_by uuid references auth.users (id) on delete set null
);

create index deletion_requests_gym_id_idx on public.deletion_requests (gym_id);
create index deletion_requests_member_id_idx on public.deletion_requests (member_id);
create index deletion_requests_executed_by_idx on public.deletion_requests (executed_by);

-- ── agent_rate_limits ─────────────────────────────────────────────────────
-- Keyed by (user_id, date); gym_id included per Rule 1 and to scope RLS,
-- even though a coach's rate limit is really a per-user counter.

create table public.agent_rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  gym_id uuid not null references public.gyms (id) on delete restrict,
  date date not null default current_date,
  query_count int not null default 0 check (query_count >= 0),
  primary key (user_id, date)
);

create index agent_rate_limits_gym_id_idx on public.agent_rate_limits (gym_id);
