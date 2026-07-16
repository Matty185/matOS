# Stage 2 Checkpoint — mid-stage, written for context-loss recovery

**Written:** 2026-07-16, mid-session. The user was about to restart the Claude Code process
(`claude --dangerously-skip-permissions --continue`) to enable autonomous work while AFK, and asked
for a durable checkpoint in case that restart drops conversation context. **If you're reading this in
a fresh session with no memory of the above: this file is your source of truth. Read it fully before
doing anything.** Also read `CLAUDE.md`, `matos_project_plan.md`, and `docs/stage-1-notes.md` for
full project context — this file assumes you have.

## Where things actually stand right now

- **Stage 1 (schema + RLS) is fully done, applied to the live Supabase project, and committed**
  (commits `9e67c65`, `d739538`). Not just written — verified against the real DB (migration list
  matches local↔remote, a real anonymous REST write was confirmed rejected by RLS with `42501`).
- **Stage 2 (auth, withAuth, invite/claim, GDPR consent) is in progress.** Exactly one piece of it
  is done: `src/types/database.ts` was generated from the live schema via
  `npx supabase gen types typescript --linked` — committed together with this checkpoint file.
  Nothing else — no client utilities, no middleware, no API routes, no pages — has been written yet.
  Do not assume anything beyond the types file exists.
- Run `git status -s` and `git log --oneline -5` first to confirm this matches reality before
  proceeding — this file could itself be stale if more happened after it was written.

## Task list (recreate with TaskCreate if the tool shows it empty — task IDs may not survive)

| #   | Subject                                                       | Status            |
| --- | ------------------------------------------------------------- | ----------------- |
| 7   | Generate Supabase TypeScript types from live schema           | **done**          |
| 8   | Supabase client utilities (browser, server/RLS, service-role) | pending — do next |
| 9   | Session-refresh middleware                                    | pending           |
| 10  | withAuth wrapper + error shape + audit log writer             | pending           |
| 11  | Zod validation schemas for auth/invite/claim                  | pending           |
| 12  | Invite + claim API routes                                     | pending           |
| 13  | Login page and invite-claim page                              | pending           |
| 14  | End-to-end verification against live Supabase project         | pending           |
| 15  | Security review gate for Stage 2                              | pending           |
| 16  | Stage 2 notes + commit                                        | pending           |

Work them roughly in this order — later ones depend on earlier ones (routes need the client
utilities + withAuth + validation; verification needs the routes; the review gate needs everything;
notes+commit is last).

## Operational facts a fresh session needs (don't rediscover these)

- **The real ECC review agents are now properly registered.** Earlier this session they had to be
  invoked via a `general-purpose` agent with the persona instructions embedded manually (registry
  didn't hot-load them mid-session). That's no longer necessary — a system reminder confirmed
  `architect`, `code-reviewer`, `database-reviewer`, `planner`, `security-reviewer` are now available
  as real `subagent_type` values for the Agent tool. **Use them directly** (e.g.
  `Agent({subagent_type: "security-reviewer", ...})`) for task #15, not the embedded-persona
  workaround documented in `docs/stage-1-notes.md`.
- **Supabase project is linked.** Project ref `lfnkgymhkmwubzvrgnjt`, confirmed via
  `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`. `supabase/config.toml` exists (generated via
  `npx supabase init`, not hand-written). To run any `supabase` CLI command needing auth:
  `set -a && source .env.local && set +a` first (bash) — `SUPABASE_ACCESS_TOKEN` and
  `SUPABASE_DB_PASSWORD` are in there, added this session specifically for this purpose.
  **`.env.local.example` was never updated to mention these two new vars — do that** (small gap,
  worth fixing whenever convenient, not blocking).
- **`RESEND_API_KEY` is populated** in `.env.local` (real key, not blank) — invite emails can
  actually be sent, not just stubbed.
- **No seed data exists yet** in the live DB (seed script is Stage 9). This matters for task #14
  (verification) — see below.
- Node is pinned to 24 (already resolved, see `CLAUDE.md` Decision Log). Don't revisit.

## Design decisions already made (not yet written into any code — carry these into implementation)

These were reasoned through in conversation but never externalized until now. Follow them rather
than re-deriving from scratch, unless you find a concrete reason they're wrong.

### Client utilities (task #8)

Three files in `src/lib/supabase/`:

- `client.ts` — browser client via `createBrowserClient` from `@supabase/ssr`. RLS-respecting.
- `server.ts` — server client via `createServerClient` from `@supabase/ssr`, cookie-based, for
  Server Components / Route Handlers / Server Actions. RLS-respecting. This is what `withAuth` and
  ordinary authenticated routes use.
- `service-role.ts` — service-role client, `SUPABASE_SERVICE_ROLE_KEY`, guarded with the `server-only`
  package (add it as a dependency — it isn't installed yet) so it physically cannot end up in a
  client bundle. Per CLAUDE.md Rule 4, this is used **only** for: invite token generation, audit log
  inserts, seeding (later), and — per this stage's design — the invite **claim** step (creating/
  linking the `auth.users` row needs the Admin API, which requires service role). The agent (Stage 7,
  not yet built) must never use this client.

### Middleware (task #9)

`src/middleware.ts`, standard `@supabase/ssr` session-refresh pattern (refresh the auth cookie on
every request so SSR reads see a current session). Additionally: a basic redirect guard for the
`(coach)` and `(athlete)` route groups — unauthenticated request to either → redirect to `/login`.
Since Stage 3 hasn't built any actual pages under those groups yet (still just `.gitkeep`), this is
groundwork more than something currently observable — fine, do it now so Stage 3 doesn't have to
retrofit it.

### withAuth (task #10)

`src/lib/auth/withAuth.ts`. Signature: `withAuth(handler, requiredRole?)` per CLAUDE.md Rule 5.
Sequence: session (via `server.ts` client, reject if none) → look up the caller's `members` row
(gives `gym_id` + `role` server-side — mirrors the `private.my_gym_id()`/`private.my_role()` SQL
pattern from Stage 1, but in TS) → role check against `requiredRole` if given (role hierarchy
`gym_owner > coach > athlete`, so `requiredRole: 'coach'` should also admit `gym_owner`) → Zod input
validation (schema passed in by the caller) → call `handler` with `{ gymId, role, userId, memberId }`
context injected, never trusting anything from the request body for these. Rate limiting is
explicitly **agent-route-only** per CLAUDE.md — don't implement real rate-limit logic now (no agent
route exists yet, Stage 7), but leave an obvious extension point (e.g. an optional
`{ rateLimit?: boolean }` option) so Stage 7 doesn't have to restructure this file.

Error shape everywhere: `{ error, code, status }`, never leaking internals (CLAUDE.md Rule 5). Put a
small shared helper (e.g. `apiError(status, code, message)`) somewhere sensible — `src/lib/auth/` or
a new `src/lib/api/` — and use it consistently, including inside withAuth itself.

### Audit log writer (task #10)

`src/lib/audit/log.ts`. Service-role insert into `audit_log` (matches Stage 1 RLS: no authenticated
INSERT policy exists, service-role only, by design). Must scrub per CLAUDE.md: never log passwords,
tokens, raw invite tokens, or post-deletion identifying data. Called from the invite-create and
invite-claim routes at minimum this stage.

### Validation schemas (task #11)

`src/lib/validation/invite.ts` (invite creation: `{ member_id: uuid }`; claim:
`{ password: string (min length per Stage 1's... actually no DB-level password policy exists,
Supabase Auth enforces its own — check `supabase/config.toml`'s `auth.minimum_password_length`,
currently 6 from the CLI default; consider raising it in config.toml since 6 is weak for a coach/
owner account, flag if not changed), consent: literal `true` required }`), `src/lib/validation/
auth.ts` (login: `{ email, password }`). Zod is the single validation source of truth per CLAUDE.md
— write these so both client (React Hook Form + `@hookform/resolvers`) and server (API routes) import
the same schema, don't duplicate.

### Invite + claim routes (task #12)

Per plan §5 API surface: `/api/invite`, `/api/invite/[token]`, `/api/invite/[token]/claim`.

- **`POST /api/invite`** — `withAuth(handler, 'coach')`. Body: `{ member_id }`. Looks up the member
  (must belong to caller's `gym_id` — withAuth context, not trusted from body), generates a random
  token (`crypto.randomUUID()` or `crypto.randomBytes`), stores **only the hash** (`token_hash`,
  matches Stage 1 schema — hash it server-side, e.g. SHA-256, before insert), 7-day expiry,
  invalidates any prior unclaimed invite for that member first ("resend invalidates old token" per
  plan §5), sends the email via Resend (service-role client for the DB write; Resend SDK already a
  dependency), writes an audit_log row. Returns success without leaking the raw token in the
  response (email is the only place the raw token appears — matches "never log... raw invite
  tokens").
- **`GET /api/invite/[token]`** — public (no session yet — the invitee isn't logged in). Hashes the
  incoming token, looks up by `token_hash`, checks `expires_at`/`claimed_at`. Returns minimal
  non-sensitive info for display (member first name, gym name) — not the full member row.
- **`POST /api/invite/[token]/claim`** — public. Validates token same as GET, enforces the
  **5-attempt limit** using `invites.attempt_count` (already in the Stage 1 schema specifically for
  this — increment on each failed attempt, invalidate the invite once it hits 5, per plan §5). On
  success: service-role Admin API creates the `auth.users` row (or sets password if somehow already
  exists — shouldn't happen in normal flow), links `members.user_id`, inserts a `gdpr_consents` row
  (`data_storage_consent: true`, `consented_at: now()`, `consent_version` — pick a literal like
  `"1.0"` and put it somewhere referenceable, e.g. `src/lib/validation/invite.ts`, so Stage 8's
  export/deletion flows can reference the same constant), sets `invites.claimed_at`, writes
  audit_log. This is registration-time consent capture per plan §1/§7 — there is no separate
  "registration" step distinct from claiming an invite in this app's model (no self-serve signup;
  every account starts as a coach-created `members` row).

**Deliberately not building:** `/api/auth/[...supabase]` (listed in plan §5's API surface table).
Investigated and concluded it's not needed for anything actually in Stage 2's scope — this app has
no OAuth/magic-link flow (password-based only, via invite/claim), and in-session "change password"
(Athlete Settings, plan §7) can call `supabase.auth.updateUser({password})` directly client-side
without a server-side code-exchange callback route. No forgot-password-via-email flow is being built
either (not explicitly required by Stage 2's stated scope). **Flag this decision to the user** — it's
a deviation from the plan's literal API surface list, made unilaterally; revisit if a later stage
turns out to need it.

### Login/claim pages (task #13)

Minimal, functional, not fully polished (Stage 3 owns dashboard chrome/nav/empty-states per the
build sequence — don't over-build here). `src/app/login/page.tsx` (email/password form, React Hook
Form + the Zod schema from task #11, calls `supabase.auth.signInWithPassword` client-side directly —
no custom API route needed for login itself, Supabase Auth handles it). `src/app/invite/[token]/
page.tsx` (public claim page: fetch invite info via the GET route, password + confirm-password
fields, a GDPR consent checkbox that must be checked to submit, calls the claim route). Match
existing conventions: Tailwind + shadcn primitives already in `src/components/ui/` (`button`, `card`,
`input`, `label` exist; add more via `npx shadcn@2.10.0 add <name>` — **must** pin to `2.10.0`, see
`docs/stage-0-notes.md`'s shadcn-v4 incident, a plain `shadcn add` will pull v4 and break the stack),
navy/Bebas Neue per `globals.css`/`tailwind.config.ts`, mobile-first per CLAUDE.md UI Standards (390px
min width, 44px touch targets).

### Verification (task #14)

No seed data exists. To actually drive the flow (not just typecheck it — see the `run`/`verify`
skills' philosophy, already used successfully for Stage 0/1 checks): create throwaway test data
directly via the service-role client — one test gym, one `auth.users` + `members` row with
`role: 'gym_owner'` (via Admin API `createUser`), sign in as that user to get a real session, call
the invite/claim routes end-to-end for a second test member. **Use Resend's test address
`delivered@resend.dev`** as the invited email so no real email gets sent anywhere. **Clean up the
test data afterward** (delete the test `auth.users` rows via Admin API, which cascades — check the
Stage 1 FK behavior on `members.user_id on delete set null` vs whether you also want to delete the
test `members`/`gyms`/`invites`/`audit_log` rows directly via service role — probably yes, delete
everything you created, since Stage 9's seed script wipes-and-reseeds anyway but there's no reason
to leave junk in the meantime).

### Security review (task #15)

Use the now-properly-registered `security-reviewer` subagent type directly (see operational facts
above). Stage 2's CLAUDE.md gate is just "security review" (not the blocking security+database dual
gate Stage 1 had) — but still worth taking seriously given this stage handles passwords, tokens, and
the invite/claim attack surface. Give it the same kind of thorough, context-rich prompt used for
Stage 1 (see conversation history / `docs/stage-1-notes.md` for the pattern) rather than a bare
"review this code" — point it at CLAUDE.md's Security Non-Negotiables (§8 in the plan) and the
Agentic Interface Rules' prompt-injection posture doesn't apply here, but invite-token handling,
password policy, and rate-limit/attempt-count enforcement do.

### Notes + commit (task #16)

Write `docs/stage-2-notes.md` following the `stage-1-notes.md` structure (what was done, decisions
beyond the plan's literal text — especially the skipped `/api/auth/[...supabase]` route — review
findings and fixes, what's deliberately deferred). Commit. **Don't push** without asking — same rule
as always, pushing is a visible/shared action requiring explicit authorization each time, a past
"go ahead" doesn't carry forward to it.

## If you're a fresh session with zero memory of any of this

Read this whole file, `CLAUDE.md`, `matos_project_plan.md` §5/§6/§8 (agent rules don't apply to
Stage 2, but skim anyway), and `docs/stage-1-notes.md`. Run `git status -s` and `git log --oneline
-5` to confirm current state matches this file's "Where things actually stand right now" section. If
it doesn't match, trust the repo over this file — this file is a snapshot, not a live source. Then
resume at task #8.
