# Stage 1 Session Notes

**Date:** 2026-07-15
**Scope:** Full schema + RLS + migrations, per `matos_project_plan.md` §10 row 1. Run autonomously
while the user was AFK, per explicit instruction to proceed with "the schema and RLS."

---

## What was done

Two migration files in `supabase/migrations/`:

- `20260715160000_schema_core.sql` — enums, all 14 tables, constraints, indexes.
- `20260715160100_rls_and_functions.sql` — `private` schema helper functions (non-recursive
  gym_id/role lookups), triggers, RLS policies on every table.

Both files carry inline design-rationale comments; this doc summarizes rather than repeats them.

### Design decisions beyond the plan's literal text

The project plan (§3/§4) doesn't fully specify everything needed to make the schema work. Where I
filled a gap, it's called out in the migration files themselves (see the header comment block in
`20260715160000_schema_core.sql`) and summarized here:

1. **`members.role`** (`gym_owner | coach | athlete`) — the plan's members column list has no role
   column, but §4's entire RLS table is written in terms of role. Folded into `members` rather than
   a separate table, matching CLAUDE.md's "belt rendering... in the same member list" framing.
2. **`gdpr_consents.gym_id` and `agent_rate_limits.gym_id`** — added to satisfy Architecture Rule 1
   ("every tenant table has gym_id, indexed"), not present in the plan's minimal column list.
3. **`invites.attempt_count`** — needed to enforce the documented 5-attempt claim limit atomically.
4. **`belt_history.promoted_by`** made nullable (`on delete set null`, not `not null`/`restrict`) —
   caught in review; `restrict` would have permanently blocked deleting a coach's `auth.users` row
   once they'd ever promoted a member.
5. **`gym_id` on member-referencing tables is trigger-derived, not client-trusted** — see review
   findings below.

### Non-recursive RLS pattern

`gym_id`/`role` lookups go through `SECURITY DEFINER` functions in a `private` Postgres schema
(not exposed by PostgREST — confirmed via a freshly-generated `supabase/config.toml`, `api.schemas
= ["public", "graphql_public"]`). These functions are owned by the migration-running role, which
isn't subject to its own tables' RLS by default, so a `members` policy can call a function that
queries `members` without recursing. `FORCE ROW LEVEL SECURITY` is deliberately never used — it
would break this pattern for no benefit, since application traffic never connects as the table
owner anyway. Every `auth.uid()`/`private.*()` call inside a policy body is wrapped in
`(select ...)`, the documented Supabase performance pattern (evaluated once per query via an
InitPlan, not once per row).

### Privilege-escalation and column-scope guards

Beyond RLS (which is row-scoped), several triggers close gaps RLS structurally can't:

- Only a `gym_owner` may create or promote a `coach`/`gym_owner` member row (role-escalation guard).
- An athlete's self-UPDATE on their own `members` row is restricted to contact fields
  (phone/emergency contact/photo) — RLS gets them to their own row, a trigger restricts which
  columns can actually change.
- `audit_log` is immutable: DELETE blocked outright, UPDATE blocked except for nulling `actor_id`
  (see review findings — this exception is required, not optional).

## ECC review — BLOCKING gate (CLAUDE.md: security-reviewer + database-reviewer before Stage 2)

**Operational note:** the `security-reviewer`/`database-reviewer`/`architect` agent definitions
added to `.claude/agents/` earlier this session weren't hot-loaded into this conversation's agent
registry (added mid-session; the registry appears to load once at session start). Ran the reviews
by spawning general-purpose agents with the target agent's full persona/instructions embedded in
the prompt instead — functionally equivalent, but a fresh session should pick up the real
project-scoped agents directly going forward.

**Three review passes were run**, all against the two migration files, cross-checked against
CLAUDE.md and `matos_project_plan.md` §3/§4/§8/§9:

1. **security-reviewer** — found 1 BLOCKED, 5 FLAGGED.
2. **database-reviewer** (parallel, independent) — found 2 BLOCKED (one overlapping with #1's
   root cause, one new), 8 FLAGGED.
3. **verification pass** (after fixes applied) — confirmed all 3 originally-BLOCKED items correctly
   resolved, but caught a **new regression introduced by my own fix** (below). Fixed and did not
   re-verify with a fourth agent pass — the fix was small, mechanical, and directly matched the
   reviewer's own suggested remedy.

### BLOCKED items, all resolved

1. **`TRUNCATE` not revoked from `anon`/`authenticated`.** TRUNCATE bypasses both RLS and row-level
   triggers — a documented Postgres/Supabase gotcha — so the audit_log immutability triggers did
   nothing against it, and any authenticated user (down to an athlete) could have erased any table
   outright. Fixed: explicit `REVOKE TRUNCATE ... FROM authenticated, anon`, plus an
   `ALTER DEFAULT PRIVILEGES` so future migrations' tables don't silently re-inherit it.
2. **No cross-tenant referential integrity.** RLS checked a row's own `gym_id` against the caller's
   gym, but never validated that a client-supplied `member_id` (or, for attendance, `class_id`)
   actually belonged to that same gym — a coach, or a self-check-in, could reference another gym's
   member/class while `gym_id` still matched their own. Fixed: `gym_id` is now derived server-side
   from the referenced `member_id`/`class_id` via `BEFORE INSERT OR UPDATE` triggers
   (`derive_gym_id_from_member`, `derive_and_validate_attendance_gym_id`) instead of trusted as
   client input, on every member-referencing table.
3. **`audit_log` immutability trigger blocked ALL updates, including ones Postgres itself needs to
   make.** `audit_log.actor_id references auth.users(id) on delete set null` — Postgres implements
   that referential action as an internal UPDATE, and ordinary row-level triggers fire for it (only
   statement-level triggers are exempt). An unconditional UPDATE block meant a coach's `auth.users`
   row could never be deleted once they'd ever appeared as an audit actor, and made the plan's
   required "audit retained with actor anonymised" GDPR step impossible to build at all. Fixed:
   `audit_log_block_mutation` now allows UPDATE only when it does nothing but null `actor_id`;
   every other column, and re-populating `actor_id` once nulled, is still rejected.

### Regression caught by the verification pass, also fixed

The actor-attribution triggers I added in response to a FLAGGED item (below) — forcing
`payments.recorded_by`/`belt_history.promoted_by`/`analyses.created_by` to `auth.uid()` — originally
fired on `INSERT OR UPDATE`. That silently reassigned attribution to whoever performed _any later,
unrelated edit_ (e.g. Coach B fixing a typo in a payment's `notes` would reassign `recorded_by` from
Coach A to Coach B), corrupting exactly the history the trigger existed to protect. The actual
threat was insert-time spoofing, not update-time drift — scoped the three triggers to `BEFORE
INSERT` only, which closes the original gap without the clobbering side effect.

### FLAGGED items also fixed (non-blocking, but cheap and worth doing now)

- `created_at` was missing from the athlete self-update column guard (an athlete could rewrite
  their own join-date-adjacent field) — added.
- Three plain trigger functions lacked `search_path` hardening, inconsistent with the rest of the
  file — added `set search_path = public, pg_temp`.
- Forgeable attribution columns (`recorded_by`/`promoted_by`/`created_by`) had no DB-level
  enforcement — added the insert-only triggers described above.
- Missing indexes: `audit_log(gym_id, actor_id)` (plan explicitly requires actor-filterable audit
  log), `attendance(gym_id, checked_in_date)`, `payments(gym_id, period_year, period_month)`, plus
  single-column indexes on the previously-unindexed `promoted_by`/`recorded_by`/`created_by`/
  `executed_by` FK columns.

### FLAGGED items deliberately left open

- **`payments.amount` has zero DB-layer protection from athlete reads.** Confirmed by both
  reviewers as an acceptable Stage-1 deferral: RLS is row-scoped not column-scoped, coach and
  athlete share the `authenticated` Postgres role, so this can only be closed by stripping the field
  in the Stage 2 API route response. **Stage 2 must actually implement this** — nothing at the DB
  layer will catch a regression if it's forgotten.
- **No safeguard against a gym ending up with zero owners** (an owner could demote themselves/the
  last owner). Not a vulnerability, worth a trigger before Stage 8.
- **Minor cross-tenant enumeration side-channel**: the new derivation triggers' error messages let a
  coach distinguish "member_id doesn't exist" from "member exists in a different gym" — low severity
  (UUIDs unguessable), flagged for Stage 8 hardening rather than fixed now.
- **`deletion_requests.executed_by`** has no attribution enforcement, unlike the other four —
  deliberately not given the same "force to self" trigger, since that column is set by a _different_
  actor (coach) at a _different time_ than the row's creator (athlete), so the same pattern would
  have wrongly stamped the requesting athlete's own id into `executed_by` at insert time. Left as an
  application-layer concern for Stage 8, when the actual execution flow is built.

## Verification performed

No Docker or local `psql` is available in this environment, so the SQL has **not been applied to a
real Postgres instance** — the review agents' "would this actually apply cleanly" analysis and my
own structural sanity checks (balanced parens, balanced `$$` dollar-quoting across both files) are
the extent of what could be verified here. `supabase/config.toml` was generated via
`npx supabase init` (not hand-written) specifically so the `api.schemas` exposure claim in the RLS
file's comments is real and repo-tracked, not assumed.

**Not yet done, needs the user:** `supabase link` (needs the project ref) and `supabase db push` (or
pasting the two files into the Supabase SQL editor in order) to actually apply this to the live
project. This is the one remaining step before Stage 2 can run against a real database — recommend
doing that first, since a real `db push` will catch anything the structural checks above couldn't.

## Node version (separate task, same session)

Resolved and documented as a full decision log entry in `CLAUDE.md` (`## Decision Log` section) —
pin moved from Node 20 (EOL 2026-04-30) to Node 24 LTS, matching what the local machine and Vercel's
new default already run. Not repeated here; see CLAUDE.md.

## Not done (out of Stage 1 scope)

- Applying the migrations to the live Supabase project (see above).
- Auth, `withAuth` middleware, invite/claim flow, GDPR consent capture — Stage 2.
- `scripts/seed.ts` — Stage 9.
- Any application code whatsoever — correctly blocked until this gate passed, which it now has.
