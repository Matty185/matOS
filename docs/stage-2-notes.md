# Stage 2 Session Notes

**Date:** 2026-07-16
**Scope:** Auth, `withAuth` middleware, roles, invite + claim flow, GDPR consent at registration, per
`matos_project_plan.md` §10 row 2. Run autonomously per explicit instruction to continue Stage 2
after a Claude Code process restart (`--dangerously-skip-permissions --continue`) — see
`docs/stage-2-checkpoint.md` for the pre-restart plan this picked up from.

---

## What was done

- **Three-client Supabase model** (`src/lib/supabase/{client,server,service-role}.ts`) per CLAUDE.md
  Rule 4 — browser (RLS), server (RLS, cookie-based via `@supabase/ssr`), service-role (`server-only`
  guarded, used only for invite generation/claim/audit writes).
- **`src/middleware.ts`** — session refresh + a public-path allowlist redirect guard. Route groups
  like `(coach)`/`(athlete)` are invisible in the URL and Stage 3 hasn't decided real paths yet, so
  this defaults to protecting everything except an explicit allowlist (`/`, `/login`, `/invite`)
  rather than guessing future protected paths.
- **`src/lib/auth/withAuth.ts`** — session → gym_id/role lookup → role check (`gym_owner > coach >
athlete` hierarchy) → Zod validation → handler, per CLAUDE.md Rule 5. Consistent `{error, code,
status}` error shape via `src/lib/api/response.ts`.
- **`src/lib/audit/log.ts`** — service-role audit_log writer with key-based scrubbing.
- **Invite + claim flow**: `POST /api/invite` (coach+, generates/resends), `GET /api/invite/[token]`
  (public, validates for display), `POST /api/invite/[token]/claim` (public, sets password, creates
  the `auth.users` row via Admin API, links `members.user_id`, captures GDPR consent, marks claimed).
  This is the app's only registration path — no self-serve signup exists.
- **`src/app/login/page.tsx`, `src/app/invite/[token]/page.tsx`** — minimal functional UI (Stage 3
  owns dashboard chrome; not over-built here).
- **TanStack Query provider** (`src/components/providers/query-provider.tsx`) wired into
  `RootLayout` — first real client-side server-state fetch (the invite GET) landed this stage, so
  this was the natural point to set it up per CLAUDE.md's standing "TanStack Query for server state"
  rule rather than reaching for raw `useEffect`+`fetch`.
- **Three new migrations** (`20260716120000`, `20260716130000`, `20260716140000` — see below).

## Decisions beyond the plan's literal text

1. **`/api/auth/[...supabase]`** (listed in plan §5's API surface) was **not built**. Investigated and
   concluded nothing in Stage 2's actual scope needs it: this app has no OAuth/magic-link flow
   (password-only, via invite/claim), and in-session "change password" (Athlete Settings, plan §7)
   can call `supabase.auth.updateUser({password})` directly client-side without a server-side
   code-exchange callback. No forgot-password-via-email flow was built either — not explicitly
   required by Stage 2. Flagged here per CLAUDE.md's "flag deviations" convention; revisit if a later
   stage needs a real auth callback route.
2. **`initiated_by` enum extended with `self_service`** (migration `20260716120000`) — the existing
   `coach_manual | agent` pair had no category for a member acting on their own account (the invite
   claim itself). Named generically, not "claim-specific," since GDPR deletion requests and other
   athlete self-service actions in later stages will need the same category.
3. **Password minimum raised 6 → 8** in `supabase/config.toml`'s `auth.minimum_password_length`, and
   matched in `claimInviteSchema`'s Zod rule — 6 was the CLI default, not a deliberate choice.

## ECC review — Stage 2 gate (CLAUDE.md: security review)

**Operational note:** unlike Stage 1, the project's own `security-reviewer`/`database-reviewer`/etc.
agents were properly hot-loaded as real `subagent_type` values this session (confirmed via a system
reminder) — no embedded-persona workaround was needed this time.

**Verdict: PASSED, no BLOCKED items.** Several FLAGGED items were found and fixed anyway rather than
left open, since they were cheap and this stage is the actual security boundary for every account in
the system going forward.

### Found via live end-to-end testing, before the formal review even ran

Real bugs, not review findings — caught by actually driving the app (Playwright against the live
Supabase project: real login, real invite creation, real claim, real 5-attempt lockout), not by
typechecking:

1. **Middleware redirected unauthenticated API requests to the `/login` HTML page** instead of
   letting them reach the route handler's own JSON 401. A test client following redirects (or a real
   browser `fetch`) would have seen a 200 with login-page HTML instead of a 401 — silently masking
   auth failures. Fixed: `/api/*` paths are now exempted from the redirect guard (session refresh
   still runs for them; `withAuth` handles their auth itself).
2. **`favicon.ico` was excluded from the middleware matcher, but the project actually serves
   `favicon.png`** (per `layout.tsx`) — unauthenticated favicon requests fell through and got
   redirected to `/login`. Harmless for rendering (browsers don't block page load on a failed icon
   fetch) but still wrong; fixed to match `public/`'s actual contents.

### Found by the formal security-reviewer pass, all fixed

1. **RLS never checked `members.active`** — deactivation was enforced only in `withAuth` (API-layer
   convenience), never at the DB layer, which is the actual security boundary per CLAUDE.md Rule 2. A
   deactivated member's Supabase Auth session isn't itself revoked by flipping `members.active`, and
   this app's browser client talks to Supabase directly for most reads, so a deactivated coach or
   athlete could keep reading/writing gym data via direct RLS-scoped queries, entirely bypassing
   `withAuth`. Not yet exploitable today (Stage 4+ is where it becomes live) but closed now rather
   than left for whichever stage first makes it matter. Fixed in migration `20260716130000`: all five
   `private.*()` RLS helper functions now additionally require `active`. **Not** extended to
   `members_select_self`/`members_update_self` (which bypass the helpers entirely, checking
   `user_id = auth.uid()` directly) — a deactivated member being able to see their own
   "deactivated" state seemed like reasonable UX, not a gap worth closing here; noted as a narrower,
   deliberately-deferred edge case.
2. **Attempt-count increment was a check-then-act race** (`app/api/invite/[token]/claim/route.ts`) —
   plain read-then-write on `invites.attempt_count`, so concurrent requests against the same token
   could all read the same stale count and lose most of the increments. Given raw tokens are
   unguessable 128-bit UUIDv4s the practical exploitability was low, but the 5-attempt cap is an
   explicit Security Non-Negotiable (plan §8.5). Fixed with an atomic RPC
   (`public.increment_invite_attempt`, migration `20260716140000`, `EXECUTE` revoked from
   `anon`/`authenticated`/`PUBLIC` — only reachable via the service-role client). Verified with 10
   concurrent requests against one token → `attempt_count` exactly 10, not lost to races.
3. **Unchecked `gdpr_consents` insert error** — if that insert failed, the code proceeded to mark the
   invite claimed and return success anyway, leaving a fully claimed, logged-in-capable account with
   no consent record and no retry path (the token would already be spent). Fixed: the error is now
   checked; on failure, the just-created `auth.users` row is deleted (rolling back the whole claim
   attempt) and a clean error returned so the same token — still within its attempt budget — can
   retry.
4. **Open redirect via `redirectedFrom`** (`app/login/page.tsx`) — the login page read
   `redirectedFrom` back from `useSearchParams()` (fully attacker-controlled via the URL) and passed
   it straight to `router.replace()` with no validation it was a safe relative path. Fixed with a
   same-origin-only check (`/^\/(?!\/)/`), falling back to `/` otherwise.
5. **Cookie `SameSite` relied on implicit browser default-`Lax` behavior**, not an explicit setting.
   Functionally adequate already (modern browsers default unset cookies to `Lax`, which blocks the
   cookie on cross-site POSTs), but asserted explicitly now (`sameSite: "lax"`, `secure` in production
   only) across all three Supabase clients rather than depending on a default a future dependency
   bump could silently change.
6. **Public-path matching in middleware was prefix-based** (`pathname.startsWith(path)`), so a future
   route literally named e.g. `/logins` or `/invitexyz` would have unintentionally become public.
   Fixed to boundary-based matching (`pathname === path || pathname.startsWith(path + "/")`).

### Flagged, deliberately left open (tracked, not forgotten)

- **`npm audit`: 9 high + 1 moderate, all rooted in `next@14.2.35`** (request smuggling, RSC
  deserialization DoS, middleware/redirect cache poisoning, CSP-nonce XSS, image-optimizer DoS). No
  patched 14.x release exists; fixing requires a major bump to `next@16`, which directly contradicts
  CLAUDE.md's "Next.js 14... do not deviate without flagging" and is a breaking change needing its
  own test pass. Same call as Stage 0 — tracked, not silently upgraded, not blocking. Worth a
  conscious decision before demo/production use, especially given this stage's new middleware
  intersects the redirect-cache-poisoning advisory directly.
- **`writeAuditLog`'s scrub only redacts top-level object keys**, not nested ones. Fine for every
  current call site (flat before/after objects); flagged for Stage 7 (agent tool calls), where nested
  payloads become likely.
- **No explicit request-body size guard** before `request.json()` in the claim route — relies on
  platform-level limits. Informational only for an alpha.

## Confirmed adequate (specifically checked, no change needed)

- Raw password: only ever passed once to `supabase.auth.admin.createUser`; never logged, never in
  any audit_log state blob.
- Raw invite tokens: never logged, never in audit_log, never returned in any API response body — only
  ever exist in the emailed URL and the claim page's own URL path.
- `token_hash` = unsalted SHA-256: adequate given the input is a random 128-bit UUIDv4, not a
  user-chosen low-entropy secret (the case salting actually defends against).
- `withAuth`'s role hierarchy correctly admits `gym_owner` wherever `coach` is required.
- No CORS headers are set anywhere; combined with `SameSite=Lax` cookies, cross-site POST to
  `/api/invite` using a logged-in coach's session is not currently feasible.
- GDPR consent (`z.literal(true)`) is enforced server-side before any account is created, not just a
  client-side checkbox.
- `invites` table RLS has no `anon`-reachable policy at all; the public invite/claim routes correctly
  rely on the service-role client rather than a public RLS hole.
- Cross-tenant invite creation is impossible: `POST /api/invite` looks up the target `member_id` via
  the RLS-respecting client, so a coach can't generate an invite for another gym's member — RLS
  naturally 404s it.

## Environment issue discovered during verification (needs the user)

**`RESEND_API_KEY` in `.env.local` is rejected by Resend's own API** — confirmed independently
(`GET https://api.resend.com/api-keys` with this key returns `400`), not a bug in the invite route,
which correctly fails loudly (502) rather than silently pretending the email sent. Invite emails
cannot actually be delivered until this is replaced with a valid key. Everything else in the invite
flow (DB writes, `gym_id` derivation, `created_by` attribution) was independently confirmed correct
regardless, by inspecting the DB directly rather than relying on the email step.

## Verification performed

Full Playwright-driven, live-database end-to-end testing (not just typecheck/build) — see the
"found via live end-to-end testing" section above for what this actually caught. Covered: login,
invite creation (authenticated + rejected-when-unauthenticated), invite validation, full claim flow
(password set, account created, member linked, consent captured, invite marked claimed, audit log
correct), re-claim rejection, 5-attempt lockout (exact-count verified), 10-concurrent-request race
check on the attempt counter, and the open-redirect fix. All temporary test data and scripts were
created and removed via the service-role client; test data cleanup is 100% complete **except** the
throwaway test gyms themselves, which cannot be deleted — see below.

**Known, permanent, harmless residue:** two throwaway test gyms (`Stage2 Verify Gym *`, `Reverify Gym
*`) remain in the live database, with all their members/invites/consents deleted but the gym row
itself un-deletable. This is because `audit_log` rows are permanently undeletable by design (Stage
1's immutability trigger blocks all DELETE, even service-role), which transitively blocks deleting
the gym via `audit_log.gym_id ON DELETE RESTRICT`. Not a bug — this is the immutability design
working as intended, just an unavoidable side effect of testing against the real database rather than
a disposable local one. **Forward-looking note for Stage 9's seed script:** "wipe and reseed" must
use `TRUNCATE` (service-role connection) rather than `DELETE` to actually reset `audit_log` — TRUNCATE
doesn't fire row-level triggers (a documented Postgres behavior, already relied on for the opposite
reason in Stage 1's TRUNCATE-revoke fix) and is the only way to clear it at all. `TRUNCATE` privilege
on `audit_log` was only revoked from `authenticated`/`anon` in Stage 1, not `service_role`, so this
remains available to the seed script.

## Not done (out of Stage 2 scope)

- Coach dashboard shell, nav, routing, first Vercel deploy — Stage 3.
- `/api/auth/[...supabase]` — deliberately not built, see decisions above.
- Forgot-password-via-email flow — not required by this stage's scope, not built.
- `scripts/seed.ts` — Stage 9.
