-- MatOS Stage S1 (matos_mobile_plan.md §2.1-2.4): account-primary schema.
-- BLOCKING-gated on security-reviewer + database-reviewer per the plan —
-- this migration alone, before any application code (Stage S2+) consumes
-- it. Schema/RLS only; no API routes or UI in this stage.
--
-- ═══════════════════════════════════════════════════════════════════════
-- DESIGN NOTES (full reasoning in CLAUDE.md's 2026-07-26 Decision Log
-- entry for Stage S1 — this is the condensed version for reviewers reading
-- the migration itself).
-- ═══════════════════════════════════════════════════════════════════════
--
-- 1. THE CORE PROBLEM this migration exists to solve: every existing RLS
--    helper function (private.my_gym_id/my_member_id/my_role/
--    is_coach_or_owner/is_owner) resolves via
--    `select ... from members where user_id = auth.uid() limit 1` — and
--    `members.user_id` carries a *global* UNIQUE constraint, so today a
--    user can only ever have one members row, period. The plan's
--    account-primary model requires a user to have a personal-workspace
--    members row AND (optionally) a real-gym members row simultaneously
--    — the global uniqueness has to relax to (gym_id, user_id), and once
--    that happens, every one of those `limit 1` helper functions becomes
--    genuinely ambiguous (which of the user's now-possibly-multiple rows
--    is "the" one?) rather than just theoretically so.
--
--    Fixing this is *not* deferred to Stage S2 ("session context...
--    active workspace/gym") despite S2 being where the actual UI for
--    switching gyms gets built. Shipping S1 with the relaxed uniqueness
--    but *not* fixing the now-ambiguous helper functions would pass a
--    review of "does the schema match the plan's column list" while
--    leaving a live, exploitable-once-any-user-has-two-memberships
--    correctness gap sitting under every single existing RLS policy in
--    the app. That is squarely why this stage is BLOCKING-gated, and it
--    would be an abdication of that gate to hand reviewers a half fix.
--
-- 2. THE FIX: a new `memberships` table (per plan §2.2's own column list:
--    user_id, gym_id, role, joined_at, active) gets one additional
--    column beyond the plan's literal list — `is_current boolean` — with
--    a partial unique index enforcing *at most one* current membership
--    per user. `private.my_gym_id()` and friends now resolve via
--    `memberships where user_id = auth.uid() and is_current`, which is
--    unambiguous by construction (the partial unique index makes "the
--    current membership" a real, enforced invariant, not a hopeful
--    `limit 1`). A new SECURITY DEFINER RPC, `public.set_active_gym()`,
--    is the only way to change which membership is current — atomically
--    unsetting the old one and setting the new one, so the invariant can
--    never be violated by a client racing two partial updates. Stage S2
--    just needs to build a UI that calls this RPC; the hard atomicity/
--    correctness work is done here, at the schema gate, where it belongs.
--
--    `memberships.role` is a denormalised snapshot (per the plan's own
--    column list) for future "list of gyms I'm in, with my role in each"
--    UI queries — it is deliberately NOT what any RLS check reads.
--    `members.role` remains the single authoritative source for
--    permission checks (my_role/is_coach_or_owner/is_owner), matching
--    every existing app code path that already reads/writes it, and
--    avoiding a second source of truth that could drift out of sync and
--    open a privilege-escalation gap if it ever did.
--
--    Existing single-gym users are fully backward compatible: this
--    migration backfills one `is_current = true` memberships row for
--    every members row that already has a linked user_id, so every
--    current user's my_gym_id()/my_role()/etc. resolve to *exactly* what
--    they resolved to before this migration — zero behaviour change for
--    any existing account.
--
--    All five helper functions keep the `and active` guard that
--    20260716130000_rls_active_member_check.sql added (a deactivated
--    member's auth session isn't itself revoked, so RLS is the only place
--    a deactivate can actually be enforced) — every function now joins
--    memberships -> members directly and checks both ms.active and
--    m.active, rather than each nesting a separate call to
--    private.my_gym_id(). The security-reviewer and database-reviewer
--    BLOCKING gate for this migration caught the `active` check being
--    silently dropped in the first draft of this rewrite (an oversight,
--    not a deliberate scope decision) — restored, and consolidated into
--    a single join per function while fixing it (the database-reviewer's
--    second finding: the nested my_gym_id() calls were a real, systemic
--    double-lookup across every policy that composes these functions,
--    since SECURITY DEFINER functions are never planner-inlined).
--
--    The same gate also caught that the one currently-live code path
--    that links a user for the first time (api/invite/[token]/claim)
--    only ever writes to members.user_id and has no knowledge of the new
--    memberships table — without a fix, every new invite claim from this
--    migration onward would silently produce a user with zero
--    memberships rows (empty app, no error). Closed with a trigger
--    (members_sync_memberships, below) rather than patching that one
--    call site, so the invariant holds for any future attach path too.
--
-- 3. members.user_id: the global UNIQUE constraint is dropped and
--    replaced with UNIQUE (gym_id, user_id) — found and dropped by name
--    dynamically (a DO block querying pg_constraint), not hardcoded,
--    since this environment has no way to directly introspect the live
--    constraint name before writing this migration and Postgres's own
--    documented auto-naming convention, while reliable, isn't worth
--    risking a failed migration over when a five-line dynamic lookup
--    removes the guesswork entirely.
--
-- 4. Trigger-level role lookups (enforce_member_role_insert_guard,
--    enforce_member_role_update_guard, enforce_member_self_update_scope)
--    had the exact same unscoped-`where user_id = auth.uid()` shape as
--    the helper functions, for the same reason (written when one row per
--    user was a safe assumption). Fixed here too, scoped to `new.gym_id`
--    (the gym the row-being-written belongs to) rather than the caller's
--    *active* gym — the more correct scope for a table-level guard,
--    since the question a write-guard needs answered is "what's my role
--    in the gym this specific row belongs to," not "what's my role in
--    whichever gym I currently have selected."
--
-- 5. breakdowns.visibility: added as specified (private | gym default
--    gym), and the three existing "staff sees everything in gym" SELECT
--    policies (breakdowns, breakdown_positions, breakdown_events) are
--    updated to require visibility = 'gym' — closing what would
--    otherwise be a real, unequal enforcement gap (a coach unable to see
--    a private breakdown's own row, but still able to see its tagged
--    positions/events directly, since those two child tables' policies
--    were flat gym_id checks with no reference to the parent's
--    visibility at all). What is explicitly OUT of scope here: the
--    "shared to gym without moving" cross-gym-sharing mechanism plan §2.2
--    describes ("personal breakdowns shared to gym become coach-visible
--    without moving") needs more than a two-value enum — a breakdown's
--    `gym_id` is a single FK, so making it visible to a *different*
--    gym's coach needs its own explicit-grant mechanism (e.g. a
--    breakdown_shares join table), which isn't in this stage's own
--    column list and is Stage S2's stated deliverable
--    ("coach-visibility enforcement"), not S1's. This migration builds
--    the private/gym distinction within a single gym; the cross-gym
--    share mechanism is intentionally not designed here.
--
-- 6. share_links: no public SELECT policy on this table at all — per
--    plan §2.4, public access must go through a security-definer
--    function that returns a sanitised, redacted projection, never a
--    blanket policy on the underlying rows. That resolution function is
--    Stage S3's own deliverable ("public share pages... token-resolved"
--    — the function belongs with the page that calls it, and S3 has its
--    own dedicated security review specifically because it's "the first
--    public surface"). This migration builds the table and owner-only
--    CRUD; token generation follows the same hash-only-storage pattern
--    already established by `invites.token_hash` (never store a
--    recoverable raw token), and public resolution is deliberately not
--    built here.
--
-- 7. entitlements: exactly as specified, select-own only, no client
--    write policy at all (payment webhooks are a future, service-role-
--    only concern — CLAUDE.md's existing "deletes/writes mostly via
--    service-role for exactly this class of table" precedent).

-- ═══════════════════════════════════════════════════════════════════════
-- A. gyms.kind
-- ═══════════════════════════════════════════════════════════════════════

create type public.gym_kind as enum ('gym', 'personal');

alter table public.gyms add column kind public.gym_kind not null default 'gym';

-- ═══════════════════════════════════════════════════════════════════════
-- B. members.user_id: relax global uniqueness to per-gym
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  found_constraint text;
begin
  select con.conname into found_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'members'
    and con.contype = 'u'
    and con.conkey = (
      select array_agg(attnum order by attnum)
      from pg_attribute
      where attrelid = rel.oid and attname = 'user_id'
    );
  if found_constraint is not null then
    execute format('alter table public.members drop constraint %I', found_constraint);
  end if;
end $$;

alter table public.members
  add constraint members_gym_user_unique unique (gym_id, user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- C. memberships
-- ═══════════════════════════════════════════════════════════════════════

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  gym_id uuid not null references public.gyms (id) on delete restrict,
  role public.member_role not null,
  joined_at timestamptz not null default now(),
  active boolean not null default true,
  -- Not in the plan's literal column list — see design note 2 above. At
  -- most one true per user, enforced below (partial unique index), not
  -- just by convention.
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  constraint memberships_user_gym_unique unique (user_id, gym_id)
);

create unique index memberships_one_current_per_user
  on public.memberships (user_id)
  where is_current;

-- No separate index on user_id alone: memberships_user_gym_unique's
-- composite btree (user_id, gym_id) already serves user_id-only lookups
-- via its leftmost prefix — a standalone copy would be pure write/storage
-- overhead. gym_id has no such prefix available, so it gets its own index.
create index memberships_gym_id_idx on public.memberships (gym_id);

-- Backfill: one is_current=true row per existing (user_id, gym_id) pair
-- that already exists via `members` — preserves every current user's
-- resolved gym/role exactly as it was before this migration.

insert into public.memberships (user_id, gym_id, role, joined_at, active, is_current, created_at)
select m.user_id, m.gym_id, m.role, m.join_date::timestamptz, m.active, true, m.created_at
from public.members m
where m.user_id is not null;

-- Keeps memberships in sync going forward, not just at this migration's
-- backfill instant. The only currently-live code path that sets
-- members.user_id for the first time is the invite-claim route
-- (api/invite/[token]/claim), which only ever UPDATEs members.user_id —
-- it has no knowledge of the new memberships table and this migration
-- can't safely assume every future attach path (an admin-linking flow,
-- Stage S2's signup flow) will remember to write to memberships either.
-- A trigger makes the invariant hold at the DB layer regardless of which
-- app code path links a user, matching CLAUDE.md's own "RLS/DB layer is
-- the actual boundary, application code is convenience" posture.
--
-- Scope note: unconditionally setting is_current = true on link is only
-- unambiguously correct today because the one live caller (invite claim)
-- always links a brand-new auth.users row with no prior memberships to
-- displace. Whether a newly-claimed *second* membership should silently
-- become the active one for an already-multi-membership user is a real
-- UX decision that belongs to whichever stage first makes that scenario
-- reachable (S2's signup/attach flow) — not decided here.
create or replace function public.memberships_sync_from_member_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and (tg_op = 'INSERT' or old.user_id is distinct from new.user_id) then
    update public.memberships set is_current = false
    where user_id = new.user_id and is_current and gym_id <> new.gym_id;

    insert into public.memberships (user_id, gym_id, role, joined_at, active, is_current)
    values (new.user_id, new.gym_id, new.role, coalesce(new.join_date::timestamptz, now()), new.active, true)
    on conflict (user_id, gym_id) do update
      set role = excluded.role, active = excluded.active, is_current = true;
  end if;
  return new;
end;
$$;

create trigger members_sync_memberships
  after insert or update of user_id on public.members
  for each row execute function public.memberships_sync_from_member_link();

-- ═══════════════════════════════════════════════════════════════════════
-- D. RLS helper functions: re-scoped to the memberships.is_current
--    invariant (my_gym_id/my_member_id) rather than an unscoped
--    `limit 1` over members. my_role/is_coach_or_owner/is_owner stay
--    anchored to members.role (still the single authoritative source —
--    see design note 2), just now correctly scoped to the resolved
--    current gym instead of an arbitrary members row.
-- ═══════════════════════════════════════════════════════════════════════

-- All five functions below join memberships -> members directly instead
-- of each (except my_gym_id itself) nesting a call to
-- private.my_gym_id() — a database-reviewer finding: SECURITY DEFINER
-- functions are never inlined by the planner, so a nested call is a
-- genuine second function execution, not a free re-read of an already-
-- cached result. Every one of these functions is composed into dozens of
-- existing RLS policies across the schema, so collapsing two lookups
-- into one join is a systemic, not local, saving. They check both
-- memberships.active and members.active (belt-and-suspenders — members
-- is the authoritative source per design note 2, memberships.active is
-- kept in sync with it going forward only via the trigger below, so
-- checking both costs nothing and covers the gap between syncs).

create or replace function private.my_gym_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ms.gym_id
  from public.memberships ms
  join public.members m on m.gym_id = ms.gym_id and m.user_id = ms.user_id
  where ms.user_id = auth.uid() and ms.is_current and ms.active and m.active
  limit 1;
$$;

create or replace function private.my_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.members m
  join public.memberships ms on ms.gym_id = m.gym_id and ms.user_id = m.user_id
  where m.user_id = auth.uid() and ms.is_current and ms.active and m.active
  limit 1;
$$;

create or replace function private.my_role()
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.members m
  join public.memberships ms on ms.gym_id = m.gym_id and ms.user_id = m.user_id
  where m.user_id = auth.uid() and ms.is_current and ms.active and m.active
  limit 1;
$$;

create or replace function private.is_coach_or_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select m.role in ('coach', 'gym_owner')
  from public.members m
  join public.memberships ms on ms.gym_id = m.gym_id and ms.user_id = m.user_id
  where m.user_id = auth.uid() and ms.is_current and ms.active and m.active
  limit 1;
$$;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select m.role = 'gym_owner'
  from public.members m
  join public.memberships ms on ms.gym_id = m.gym_id and ms.user_id = m.user_id
  where m.user_id = auth.uid() and ms.is_current and ms.active and m.active
  limit 1;
$$;

-- Atomic active-gym switch — see design note 2. The only sanctioned way
-- for `is_current` to change; ordinary client UPDATEs on memberships
-- have no write policy at all (below), specifically so this invariant
-- can only be mutated through this single, atomic, validated path.
create or replace function public.set_active_gym(p_gym_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serializes concurrent calls for the same user (double-tap, two
  -- devices near-simultaneously). Without this, two concurrent switches
  -- can both pass the exists-check, then race the two UPDATEs below —
  -- the partial unique index still prevents any invariant violation from
  -- landing in the table, but the loser gets a raw unique_violation
  -- instead of a clean serialized result. The lock is released
  -- automatically at transaction end.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  if not exists (
    select 1 from public.memberships
    where user_id = auth.uid() and gym_id = p_gym_id and active
  ) then
    raise exception 'no active membership for that gym';
  end if;

  update public.memberships set is_current = false
  where user_id = auth.uid() and is_current and gym_id <> p_gym_id;

  update public.memberships set is_current = true
  where user_id = auth.uid() and gym_id = p_gym_id;
end;
$$;

grant execute on function public.set_active_gym(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- E. Trigger-level role lookups — same unscoped-lookup issue as the
--    helper functions above, fixed the same way but scoped to the
--    row's own gym (new.gym_id), not the caller's active gym — see
--    design note 4.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.enforce_member_role_insert_guard()
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
  if acting_role is not null and acting_role <> 'gym_owner' and new.role <> 'athlete' then
    raise exception 'only a gym owner may add a member with an elevated role';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_member_role_update_guard()
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
  if acting_role is not null and acting_role <> 'gym_owner' and new.role is distinct from old.role then
    raise exception 'only a gym owner may change a member''s role';
  end if;
  return new;
end;
$$;

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
      or new.email <> old.email
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

-- ═══════════════════════════════════════════════════════════════════════
-- F. memberships RLS — per plan §2.4: "own rows readable; gym owner
--    reads gym's". No client write policy at all (see design note 2 —
--    is_current only changes via set_active_gym; the backfill above and
--    any future signup/attach-flow inserts are service-role-only for
--    now, matching Stage S2's not-yet-built scope).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.memberships enable row level security;

create policy memberships_select_own on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy memberships_select_staff on public.memberships
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

-- ═══════════════════════════════════════════════════════════════════════
-- G. breakdowns.visibility — see design note 5.
-- ═══════════════════════════════════════════════════════════════════════

create type public.breakdown_visibility as enum ('private', 'gym');

alter table public.breakdowns
  add column visibility public.breakdown_visibility not null default 'gym';

drop policy breakdowns_select_staff on public.breakdowns;
create policy breakdowns_select_staff on public.breakdowns
  for select to authenticated
  using (
    gym_id = (select private.my_gym_id())
    and (select private.is_coach_or_owner())
    and visibility = 'gym'
  );

drop policy breakdown_positions_select_staff on public.breakdown_positions;
create policy breakdown_positions_select_staff on public.breakdown_positions
  for select to authenticated
  using (
    gym_id = (select private.my_gym_id())
    and (select private.is_coach_or_owner())
    and exists (
      select 1 from public.breakdowns b
      where b.id = breakdown_id and b.visibility = 'gym'
    )
  );

drop policy breakdown_events_select_staff on public.breakdown_events;
create policy breakdown_events_select_staff on public.breakdown_events
  for select to authenticated
  using (
    gym_id = (select private.my_gym_id())
    and (select private.is_coach_or_owner())
    and exists (
      select 1 from public.breakdowns b
      where b.id = breakdown_id and b.visibility = 'gym'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- H. entitlements — designed now, unused in v1. See design note 7.
-- ═══════════════════════════════════════════════════════════════════════

create type public.entitlement_plan as enum ('solo', 'gym');
create type public.entitlement_status as enum ('active', 'trialing', 'canceled', 'expired');
create type public.entitlement_source as enum ('iap_apple', 'iap_google', 'stripe', 'manual');

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan public.entitlement_plan not null,
  status public.entitlement_status not null default 'active',
  source public.entitlement_source not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index entitlements_user_id_idx on public.entitlements (user_id);

create trigger entitlements_set_updated_at
  before update on public.entitlements
  for each row execute function public.set_updated_at();

alter table public.entitlements enable row level security;

create policy entitlements_select_own on public.entitlements
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════
-- I. share_links — the first genuinely public-surface-adjacent table in
--    MatOS, though nothing in this migration actually grants public
--    access (see design note 6). token_hash-only storage mirrors
--    invites.token_hash exactly — the raw token is never persisted.
-- ═══════════════════════════════════════════════════════════════════════

create type public.share_link_type as enum ('profile', 'breakdown');

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  type public.share_link_type not null,
  -- Polymorphic by `type` (a member/external_person id for 'profile', a
  -- breakdown id for 'breakdown') — no FK possible across two different
  -- possible target tables; validated at the application layer (Stage S3)
  -- against whichever table `type` points at, same pattern this codebase
  -- already accepts for e.g. breakdowns.member_id/external_person_id
  -- being mutually exclusive rather than a single polymorphic column,
  -- except here the two possible targets don't share a common shape.
  subject_id uuid not null,
  token_hash text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  redact_opponents boolean not null default true,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index share_links_gym_id_idx on public.share_links (gym_id);
create index share_links_created_by_idx on public.share_links (created_by);
create index share_links_subject_id_idx on public.share_links (subject_id);

alter table public.share_links enable row level security;

-- Owner-only CRUD (manage your own share links). Deliberately NO public
-- SELECT policy — see design note 6; public token resolution is a
-- Stage S3 security-definer function, not built here.

create policy share_links_all_own on public.share_links
  for all to authenticated
  using (created_by = (select auth.uid()) and gym_id = (select private.my_gym_id()))
  with check (created_by = (select auth.uid()) and gym_id = (select private.my_gym_id()));
