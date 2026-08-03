# CLAUDE.md — MatOS

Persistent context for Claude Code and all ECC agents working on this repository. Read fully before any task. The companion document `matos_project_plan.md` contains the complete specification — this file is the operational summary. Where they conflict, the project plan wins.

## What This Is

MatOS is a multi-tenant BJJ gym management platform. Current phase: **alpha** — a functional demo with seeded fictional data (demo gym "Northside BJJ"), built for a technical collaborator demo and a first unpaid gym tester. Core differentiator: a natural-language agentic interface for coaches, plus a stubbed AI video analysis feature (real pipeline is a later phase — **no video is ever stored, process-and-discard model**).

**2026-07-26 — now also expanding into a Solo Athlete Platform + native mobile app.** Companion spec: `matos_mobile_plan.md` (repo root) — where they conflict with anything below, the mobile plan wins for the account-primary/mobile scope; this file and `matos_project_plan.md` remain authoritative for the existing web alpha otherwise. See that plan's own §2.1 for the account-primary schema/RLS direction (Stage S1, BLOCKING-gated) that will eventually make "every user has exactly one gym" stop being a safe assumption anywhere in this codebase.

## Repository Structure (as of Stage S0 — monorepo restructure)

npm workspaces monorepo:

```
apps/web/        ← this Next.js app (everything below "## Stack" describes this)
apps/mobile/      ← Expo React Native app (from Stage M0 onward — does not exist yet)
packages/shared/  ← types, Zod schemas, event taxonomy types, metric computation,
                     a minimal Supabase client factory, format utils — imports
                     neither react-dom nor react-native
supabase/         ← migrations + seed data (shared backend, repo root, not app-specific)
scripts/seed.ts   ← repo root, seeds the shared backend
```

Every path elsewhere in this file that looks like `src/...` means `apps/web/src/...` — this file predates the restructure and most of it was written when `src/` was the repo root; treat that as implicit rather than rewriting every historical reference. New path references added from here on should be written relative to `apps/web/` or `packages/shared/` explicitly.

## Stack (do not deviate without flagging)

- Node 24 LTS (updated 2026-07-15 from Node 20, which reached EOL 2026-04-30; see decision note below), npm, Next.js 14 App Router, TypeScript **strict** (`strict: true`, `noUncheckedIndexedAccess: true`)
- Tailwind + shadcn/ui. Primary colour deep navy `#1B4F72`. Inter body, Bebas Neue headings
- Supabase: Postgres + RLS + Auth + Storage (photos/documents ONLY — never video)
- TanStack Query for server state; useState for UI state; no global state library
- React Hook Form + Zod — Zod schemas are the single validation source of truth, shared client/server
- date-fns (never moment.js)
- Claude API: Haiku 4.5 for the agentic interface, full response (no streaming)
- Resend for invite emails only. No other email sending in alpha
- Vercel deployment, next-pwa, ESLint + Prettier + husky
- Testing is deferred. Console logging only (no Sentry)

## Architecture Rules

1. **Multi-tenant from day one.** Every tenant table has `gym_id` (FK, indexed). One gym exists in alpha; the model supports many.
2. **RLS at the database layer is the security boundary.** Application-layer checks are UX convenience only. Every table has RLS enabled. No public SELECT on anything.
3. **Roles:** `gym_owner` > `coach` > `athlete`. Owner adds gym settings + coach management on top of coach. Athletes see and touch ONLY their own data — enforced by RLS, and payment `amount` is additionally filtered server-side for athlete queries (two layers).
4. **Two Supabase clients:** browser client (RLS-respecting) for everything user-facing; service-role client (env var, server-only, never in bundle) ONLY for invite generation, audit log inserts, and seeding. The agent uses the RLS client exclusively.
5. **Every API route** is wrapped in `withAuth(handler, requiredRole?)`: session → gym_id match → role → Zod input validation → rate limit (agent route only). Error shape: `{ error, code, status }`. Never leak internals in errors.
6. **Deletes are mostly disabled.** Members are deactivated, not deleted. Audit log is immutable. GDPR deletion anonymises (see plan §7) rather than hard-deleting payments and audit entries.
7. **Classes use a template model** (recurring class + attendance dated by check-in timestamp). This is a known simplification — flag anything that would make the future refactor to per-session instances harder.
8. **Overdue is computed at query time**, never stored: `status = unpaid AND period end < today`. No grace period. `waived` is a manual coach override.

## Agentic Interface Rules (critical)

- `gym_id` is injected **server-side** into every tool call. Never trust it from model output.
- Tool parameters are validated server-side regardless of what the model returns.
- Read tools execute immediately. **All write tools require coach confirmation** in the UI before execution; confirmed writes go through the RESTful resource endpoints (not back through /api/agent).
- `deactivate_member` requires **typed** confirmation ("yes"/"confirm"), not a button.
- Tool results go back to the model as structured JSON, never interpolated into the prompt as prose. Member-entered text is untrusted — the system prompt says so explicitly. Model output is schema-validated before render and never rendered as raw HTML.
- Rate limit: soft warning at 40 queries/day, hard block at 50.
- Every agent action writes an audit_log row including the raw natural-language query.
- Tone: terse and functional. "Done. John Murphy marked as paid for June."
- Multi-step chaining is allowed (one batched confirmation). Disambiguate duplicate names by listing options with distinguishing detail. Out-of-scope queries get a brief redirect listing actual capabilities — no apologising.

## UI Standards

- Mobile-first: every screen works at 390px, touch targets ≥44px, no horizontal scroll, WCAG AA contrast.
- Proper empty states (with an action) on every list view. Loading states on every async action. Toasts for transient errors, inline for validation, fallback error page for the unhandled.
- Belt rendering always via the shared `<BeltDisplay />` component (belt colour + up to 4 stripe dots). Belt enum includes kids belts (grey/yellow/orange/green families) in the same member list.
- Belt promotion triggers a simple celebration animation.
- The agent lives in a floating button (React portal, fixed position) opening a chat panel. In-session history only.
- Attendance view uses Supabase realtime — check-ins appear live.

## Working Conventions

- Schema changes are new migration files, never edits to applied migrations.
- Commit at every stage checkpoint (plan §10). Deploy to Vercel from Stage 3 onward.
- The seed script `scripts/seed.ts` (run: `npx tsx scripts/seed.ts`) is re-runnable — wipes and reseeds. Uses the service-role client.
- Secrets live in env vars only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`.
- Security headers configured in next.config.js: X-Frame-Options DENY, nosniff, strict-origin-when-cross-origin, restrictive CSP (Supabase + Anthropic only).
- Audit log writer scrubs: passwords, tokens, raw invite tokens, post-deletion identifying data.

## ECC Agent Invocation

- After Stage 1 (schema + RLS): run **security-reviewer** and **database-reviewer**. BLOCKING — do not write application code until passed.
- After each module (Stages 4–8): security-reviewer + code-reviewer (acting as critic against the project plan) + UX review against the standards above.
- Before demo: full pass, all three.
- Security and critic BLOCKED items halt the build. UX BLOCKED items are logged and resolved in the polish stage.
- Report format: AGENT / MODULE / DATE / PASSED / FLAGGED (issue + suggested fix) / BLOCKED.

## Out of Scope — Do Not Build

Real video analysis, payment processing, notification emails, React Native app, tests, Sentry, staff role, per-session class instances, waitlists, 2FA. If a task seems to require one of these, stop and flag it instead.

## Match Analysis Module

Companion spec: `matos_analysis_module_plan.md` — where they conflict, the plan wins.

**Tagging screen UX redesign** (2026-07-25, in progress): `matos_tagging_ux_plan.md` — a UX-layer-only
redesign of the tagging screen (two-column desktop layout, fullscreen mode, a watching/tagging mode
split with a category rail, undo toast, keyboard shortcuts). No schema/data-model/tagging-semantics
changes — everything in this section and the module plan's §3/§5 stays authoritative. Own build sequence
(U1–U6) and review gates, same staged-with-explicit-go-ahead discipline as the A0–A9 sequence above.

### What This Module Is

Layer 1: manual match breakdown — client-side video player + tagging tool producing a timestamped record (positional intervals with roles + discrete events with modifiers/outcomes). Layer 2: computed athlete profiles from accumulated breakdowns, with side-by-side comparison. AI tagging is **phase 2, not now** — do not build it, but do not block it (the `source` field on events exists from day one).

### Non-Negotiables

1. **Video never touches the server.** Playback is a local file via `URL.createObjectURL`. No upload endpoint, no storage, no video URLs in the database. Only `video_filename` + `video_duration_seconds` are stored (resume mismatch check).
2. **Single focus athlete per breakdown.** Everything is tagged from their perspective — the opponent's takedown attempt is the focus athlete's `takedown_defended`. Never design UI or data for two-athlete tagging.
3. **Taxonomy is data, not code.** Events, modifiers, and outcome rules live in the `event_types` seed table. Coach edits to the taxonomy must never require schema or component changes.
4. **Outcomes are conditionally required** per event_types (`outcome_required`). Validate server-side against `outcome_options`; the confirm sheet blocks only on required fields.
5. **Breakdowns are standalone artifacts** identified by name + user-entered `match_date` (required — it drives all trajectory ordering, since analysis can happen long after the match). Not replayable against video.
6. **Profiles are computed, not authored.** Gi/no-gi always separate. Every metric renders its n. Shown from n=1. Trajectory ordered by match_date, never created_at.
7. **External people** are gym-scoped analyst records (free-named, unlinked to accounts). No merging into member profiles — don't build for it.
8. **Ownership:** author owns a breakdown; one author, no collaboration. Coach/owner see all in gym. Breakdown deletion cascades its positions/events (allowed — unlike member records).
9. **Agent tools are read-only and factual.** Profile/metric/comparison queries return numbers. Never coaching advice — "what should X work on" gets the weakest metrics reported factually, nothing more. Same server-side gym_id injection and parameter validation as all existing tools.
10. **GDPR:** member deletion also deletes their member-linked breakdowns. The AI-transit compliance question (third-party opponents in footage) is deliberately deferred to phase 2 — do not introduce any server-side video processing in v1.

### Tagging UX Contract

Tap event → auto-pause → modifier/outcome sheet → confirm → resume. Two taps total for no-modifier events. Position tags open an interval; the next position tag closes the previous one. Timeline strip with tappable markers for edit/delete/timestamp adjust. Continuous local draft + explicit server save; resume warns on filename/duration mismatch but allows proceeding. Speeds 0.25×–2×. All alpha UI standards apply (390px, 44px targets, empty/loading/error states).

### Build Gates

Stage A1 (schema + RLS + event_types seed) is BLOCKING on security-reviewer + database-reviewer, same as alpha Stage 1. All-reviewer gates after tagging screen (A3), profiles (A5), and integration (A7). Full pass at A9. Never proceed past a security or critic BLOCKED item.

### Out of Scope — Match Analysis Module

AI tagging, video storage/upload/URLs, keyboard shortcuts, two-athlete tagging, canonical match linking, ruleset/points events, collaborative breakdowns, external-person merging, breakdown replay against video. Flag, don't build.

## Decision Log

### 2026-07-15 — Node version pin: 20 → 24

**Context.** CLAUDE.md and `package.json` (`engines`) pinned Node 20 LTS. Node 20 reached EOL 2026-04-30 (no further security patches). The local dev machine has been running Node 24.18.0 the entire time regardless of the pin, causing `EBADENGINE` warnings on every `npm install`. Node 22 (Active LTS, → Maintenance ~Oct 2026, EOL Apr 2027) and Node 24 (Active LTS, EOL Apr 2028, now Vercel's default for new projects) were the live options.

**Decision.** Pinned to Node 24 (`engines: ">=24 <25"`, `@types/node: ^24`).

**Reasoning.** The dev environment and almost certainly CI/Vercel builds have already been running on Node 24 in practice, so this pin change codifies the status quo rather than introducing a new untested runtime — Node 22 would mean adopting a _third_, still-unexercised version. Node 24 also has the longest runway (Apr 2028) of the two live options and is Vercel's new default, minimizing future churn for a solo-maintained alpha. Flagging per CLAUDE.md's "do not deviate without flagging" clause: this was resolved autonomously while the human was AFK; no code changes beyond the version pin were made, and a build/smoke test against Node 24 is still recommended before the next deploy.

**Alternatives considered.**

- _Node 22 (conservative Active LTS):_ rejected — less runway than 24, and would still be a version never actually run locally, so it doesn't remove the drift between documented and actual runtime.
- _Install Node 20 via nvm to match the existing pin:_ rejected — reinstalling an EOL, unpatched runtime for a network-facing demo app (Supabase Auth, Claude API, invite emails) to preserve a stale pin has real downside and no upside; "flag deviations" is satisfied by this log entry, not by manually enforcing a dead version.

### 2026-07-20 — CSP `unsafe-inline`/`unsafe-eval`, and Next 14.2.35's open npm audit advisories: accepted for alpha

**Context.** Stage 11's full pre-demo security review flagged two related gaps, both FLAGGED (not BLOCKED) by the reviewing agent: (1) `script-src` in `next.config.mjs` includes both `'unsafe-inline'` and `'unsafe-eval'`, which — together — mean CSP provides no real XSS mitigation if an injection sink is ever introduced (none exists today; no `dangerouslySetInnerHTML`/`innerHTML` anywhere in `src/`, confirmed by the review); (2) `npm audit --audit-level=high` reports 9 high-severity advisories against the installed `next@14.2.35` (Server Component DoS, request smuggling, redirect cache poisoning, SSRF, RSC cache poisoning, `beforeInteractive` script XSS), all requiring a Next 15/16 upgrade to resolve.

**Decision.** Dropped `'unsafe-eval'` from `script-src` in production only (kept in `next dev` — webpack's HMR eval-devtool needs it; a production client bundle doesn't). `'unsafe-inline'` stays for both — removing it needs a nonce threaded through Next's own framework-injected RSC hydration `<script>` tags, a real code change (middleware nonce generation + response-header wiring), not a config toggle. Left the Next.js version pin at 14.2.35, npm audit advisories un-remediated.

**Reasoning.** `'unsafe-eval'` in production was pure unnecessary exposure with a free, verified-safe removal (tested against a real `next build` + `next start` session, zero console/functionality regressions) — no reason to defer that part. The other two (the `'unsafe-inline'` nonce rework, and the Next 15/16 upgrade) are both real, non-trivial changes with meaningful blast radius — a mis-wired CSP nonce breaks hydration on every page, and a major-version framework upgrade this close to a demo risks the exact kind of last-minute breakage CLAUDE.md's own stack-pinning philosophy exists to avoid. Neither advisory is confirmed exploitable against this specific app's actual configuration (single-tenant-focused alpha, no public-facing attacker-supplied-URL rewrite/proxy usage that several of the advisories specifically target), and React's auto-escaping already closes the sink CSP's `script-src` would otherwise be the last line of defense against. Flagging per CLAUDE.md's "do not deviate without flagging" clause rather than carrying this forward silently a third time (it was already deferred once at Stage 0, and again — undetected — through Stage 10's polish pass).

**Alternatives considered.**

- _Implement a nonce-based CSP now, dropping `'unsafe-inline'` entirely:_ rejected for this pass — correct implementation requires per-request nonce generation in middleware plus confirming Next 14.2.35's exact framework-script nonce-detection behavior, which isn't something to get subtly wrong three days before a demo without the ability to verify against live Next.js framework documentation. Worth doing properly in a dedicated pass, not squeezed into this review's remaining scope.
- _Upgrade to Next 15 now to clear the audit advisories:_ rejected — breaking change, no patched 14.x point release exists, and forcing it this late trades a disclosed-but-unconfirmed risk for a real, immediate one (an upgrade regression during final demo prep).
- _Silently leave both as they were:_ rejected — CLAUDE.md's own "flag deviations" rule and the fact that this is literally the "pre-demo security pass" the Stage 0 deferral was written to be resolved at.

### 2026-07-23 — Scrapped the pre-plan "hard-metrics event log" analysis rework

**Context.** Before the Match Analysis Module plan (`matos_analysis_module_plan.md`) existed, a prior session reworked the alpha's video-analysis stub into a timestamped hard-metrics event log: extended the `analyses` table (`method`/`duration_seconds`/`opponent_name`/`result`/`result_method`), added an `analysis_events` table, a manual client-side video-timestamping player, new `/api/analyses/*` routes, and a per-athlete stats aggregation. All of it shipped and was deployed live. It does not match the plan's actual data model (`breakdowns`/`breakdown_positions`/`breakdown_events`/`event_types`/`external_people` — positional intervals with roles, discrete events with modifiers/outcomes, focus-athlete perspective) or UX (tap-to-tag with auto-pause, not free-form event logging).

**Decision.** Scrapped entirely rather than adapted. Deleted the 14 files that were new work (components, `/api/analyses/*` routes, `src/lib/analysis/*`, the two migrations), reverted the 8 files that were modified in place back to their exact pre-rework alpha-stub state (the athlete upload page, the coach `AnalysisTab`, `/api/video/upload`, the agent's `get_analysis_stubs` tool, the seed script, `next.config.mjs`'s CSP), and wrote one new migration (`20260723170000_revert_analysis_events_rework.sql`) restoring the live `analyses` table to byte-identical shape with the original alpha stub — verified against the live schema, not assumed. `src/types/database.ts` was regenerated fresh from the restored schema rather than git-reverted, to guarantee it matches reality rather than trusting history.

**Reasoning.** Adapting the existing tables/components toward the plan's shape would have meant carrying forward a data model and UX that the plan explicitly supersedes (event logging vs. tap-to-tag interval/event tagging with a completely different table structure) — more total work and more risk of subtle leftover assumptions than a clean scrap before Stage A1 lays down the real schema. The original alpha mock Analysis tab (prose "technique breakdown" stub) was deliberately preserved, not removed — the addendum's own build sequence keeps it in place until Stage A7 replaces it, so athletes/coaches aren't left with a broken screen in the interim.

**Alternatives considered.**

- _Adapt the existing `analyses`/`analysis_events` tables toward the plan's schema instead of scrapping:_ rejected — the plan's tables are structurally different (positions-as-intervals + events-with-modifiers-and-outcomes vs. a flat event log), so "adapting" would mean rewriting nearly everything anyway while carrying forward migration cruft and RLS policies shaped around the wrong model.
- _Delete the two forward migration files and leave the live database as-is (schema drift between repo and DB):_ rejected — CLAUDE.md's own "RLS at the database layer is the security boundary" posture depends on the schema in migrations matching what's actually deployed; leaving them mismatched would make every future migration author from a false picture of the live schema.
- _Edit the two applied migration files in place to "fix" them:_ rejected outright — directly conflicts with CLAUDE.md's "schema changes are new migration files, never edits to applied migrations" rule; a new revert migration preserves the true history (this was tried, then reverted) instead of rewriting it.

### 2026-07-24 — Stage A7: retired the alpha's original `analyses` stub table and upload flow

**Context.** The 2026-07-23 entry above deliberately kept the alpha's original mock Analysis tab and video-upload stub in place "until Stage A7 replaces it, so athletes/coaches aren't left with a broken screen in the interim." Stage A7 (per `matos_analysis_module_plan.md`'s build sequence: "Member profile Analysis tab replaced (mock removed); agent tools added") is that point. Researching the full blast radius before touching anything found the `analyses` table wired into more than just the two obvious UI spots: the coach member-profile `AnalysisTab`, the athlete `/upload` page + `/api/video/upload` route, the agent's `get_analysis_stubs` tool, and — less obviously — the GDPR data-export route (`/api/account/export`, via a deliberate service-role bypass of `visible_to_athlete`) and the GDPR deletion-execute route (`/api/deletion-requests/[id]/execute`, a hard delete). The Stage A1 schema migration's own design notes had already flagged that GDPR deletion wiring for the new `breakdowns` table (Non-Negotiable #10) was deferred "to whichever stage first builds breakdown CRUD routes" — which had, by this point, already happened (Stages A2-A3).

**Decision.** Retired the `analyses` table and everything built on it in one pass, rather than leaving it as inert dead schema alongside the new module: (1) replaced the coach `AnalysisTab` with the real computed profile (`<ProfileView>`, Stage A5) plus that member's actual breakdown list; (2) deleted the athlete `/upload` page, `/api/video/upload` route, and the now-empty `api/video/` directory, and removed "Upload" from the athlete nav (the "Analysis" nav entry, live since Stage A2, fully supersedes it); (3) replaced the agent's single `get_analysis_stubs` tool with four read-only tools matching plan §8 exactly — `get_athlete_profile`, `get_metric`, `compare_profiles`, `get_breakdowns` — backed by a new `metric-catalog.ts` (single source of truth for `get_metric`'s metric-name enum, shared between the tool schema and its executor) and a `fetch-profile-data.ts` extracted from Stage A5's browser-only profile hook so both the browser client and the agent's server client reuse the identical query/aggregation logic; (4) wired the previously-deferred GDPR breakdown deletion (hard-delete of member-focused breakdowns, cascading to positions/events via the existing FK) and GDPR breakdown export (service-role, mirroring the exact bypass-RLS-for-completeness reasoning the old `analyses` export used); (5) wrote a new migration dropping the `analyses` table, its two table-specific trigger functions, and the `analysis_status` enum — carefully NOT dropping `derive_gym_id_from_member()` or `enforce_created_by_self()`, both confirmed shared with several other tables via a full grep of every migration before touching anything; (6) removed the now-dead mock-analyses seeding block from `scripts/seed.ts`.

**Reasoning.** This codebase's own established practice (the 2026-07-23 scrap above, the Stage 0 CSP deferral eventually resolved rather than carried forward silently a third time) is to actually finish cleanup once the reason for deferring it has passed, not to accumulate dead schema/UI as sediment. Stage A7 is explicitly the point the build sequence names for this, and the GDPR gap was already a tracked, explicitly-flagged item rather than a new one being introduced — closing it here, in the same pass that touches the same data domain, was cheaper and lower-risk than leaving it for whatever stage happened to next touch GDPR code (there isn't one on the build sequence) or waiting for Stage A9's BLOCKING full-pass review to catch it as a finding.

**Alternatives considered.**

- _Replace only the coach `AnalysisTab` (the plan row's literal wording) and leave `/upload`, the old agent tool, and the GDPR gap alone:_ rejected — the athlete `/upload` page becomes pure redundant surface area once the coach tab no longer needs `analyses` to exist (nothing else reads it), and leaving a known, already-flagged GDPR gap in place with no plan-sequence stage left to close it risks it surfacing as a BLOCKED finding at Stage A9 instead, later and under more time pressure.
- _Keep the `analyses` table in the schema, unused, rather than writing a removal migration:_ rejected — this codebase's schema-review discipline (security-reviewer + database-reviewer gates) depends on the migration history reflecting what's actually live and actually used; an inert table with real RLS policies and triggers still sitting on it, never queried by anything, is exactly the kind of stale attack-surface-that-isn't-attack-surface-but-looks-like-it a future review pass would have to re-investigate from scratch to confirm is safe to ignore.
- _Drop `derive_gym_id_from_member()`/`enforce_created_by_self()` along with the analyses-specific triggers, then recreate them if something broke:_ rejected — both are shared by several other live tables (belt_history, payments, athlete_logs, gdpr_consents, invites, deletion_requests); dropping first and discovering the breakage via a failed build would have been a needless self-inflicted outage risk when a five-minute grep across every migration file settled it definitively up front.

### 2026-07-26 — Stage S0: monorepo restructure, package-boundary decisions

**Context.** `matos_mobile_plan.md` §2.1 specifies the target shape (`apps/web`, `apps/mobile`, `packages/shared`) but leaves several boundary calls to the implementer: exactly what "Supabase client factory" in `packages/shared` means given web's existing client/server/service-role split is inherently Next.js-specific (cookies via `@supabase/ssr`, `next/headers`), how lint-staged should treat a workspace `packages/shared` has no framework-aware ESLint config for, and how to point Vercel at the new build location without touching dashboard-only settings from an agent session.

**Decision.** (1) **Supabase client split:** `packages/shared/src/supabase/client.ts` is a thin `createSupabaseClient(url, key, options)` wrapping `@supabase/supabase-js`'s `createClient<Database>` — genuinely platform-agnostic, since it takes session-persistence strategy as an opaque `options` param. Web's own `client.ts`/`server.ts` (browser/SSR-cookie-aware, via `@supabase/ssr`) and `service-role.ts` stay in `apps/web` unchanged in behavior, just importing the `Database` type from `@matos/shared` instead of defining/duplicating it. The service-role client in particular stays in `apps/web` only, permanently — never reachable from any package `apps/mobile` will also depend on, even indirectly via workspace resolution. (2) **Event taxonomy types** (`PositionRef`/`EventTypeRef`/`PositionRow`/`EventRow`) didn't exist as a shared file before this — they were defined inline in `tagging-screen.tsx` (and duplicated inline again in `tag-edit-dialog.tsx`). Extracted to `packages/shared/src/taxonomy/types.ts`, both call sites updated to import from there — this also deduplicates the two inline copies that already existed pre-restructure, not just relocates one. (3) **lint-staged** narrowed its `eslint --fix` step to `apps/web/**/*.{js,jsx,ts,tsx}` only (was previously a single repo-wide glob, back when the repo root and the Next app were the same directory) — `packages/shared` has no Next-aware ESLint config of its own yet, and standing one up was out of scope for a stage whose own gate is "nothing user-visible changes." `prettier --write` stays repo-wide, since Prettier doesn't need a framework-specific config to resolve. (4) **Vercel:** rather than changing the dashboard's Root Directory setting (an out-of-repo action), added a root `vercel.json` (`installCommand: npm install`, `buildCommand: npm run build --workspace=apps/web`, `outputDirectory: apps/web/.next`) and kept `.vercel/project.json` at the repo root — the directory the Vercel CLI has been invoked from all along this project's history — so the existing project link keeps working with zero dashboard changes.

**Reasoning.** Each of these keeps the "S0 changes nothing user-visible, packages/shared imports neither react-dom nor react-native" constraint as literally true as possible: the client-factory split avoids either (a) forcing Next-specific SSR cookie logic into a package mobile will also import, which would be actively wrong for RN, or (b) pretending a "shared" factory exists when the real value (avoiding type drift) is fully captured by just sharing the `Database` type. The lint-staged narrowing is a scope-appropriate deferral, not a silent gap — flagged here rather than either standing up unrequested new tooling or leaving `packages/shared` files invisible to `eslint --fix` without anyone knowing why. The `vercel.json` approach keeps deployment config in-repo and reviewable rather than requiring an unreviewable dashboard click from an agent session.

**Alternatives considered.**

- _Reimplement `@supabase/ssr`'s cookie-handling logic generically inside `packages/shared` so web and mobile could share one factory call:_ rejected — RN has no cookies at all (Supabase-on-RN uses AsyncStorage/SecureStore via plain `@supabase/supabase-js` options), so a "shared" cookie-aware factory would either be dead code on mobile or would need platform branching inside the shared package itself — more complexity than the thin-wrapper-plus-shared-types split for no real benefit; `@supabase/ssr`'s own `createBrowserClient`/`createServerClient` already are the correct, officially-maintained web-SSR factory, not something worth reimplementing.
- _Set up a minimal root-level ESLint config now so `packages/shared` gets linted too:_ rejected for this stage specifically — right scope for a later stage (or whenever `packages/shared` grows enough files that skipping lint on it becomes a real risk), not this one, whose own gate is regression-only.
- _Point Vercel's Root Directory at `apps/web` via the dashboard instead of `vercel.json`:_ rejected — functionally equivalent, but moves a real config decision out of the repo and into an unreviewable, unversioned dashboard click; `vercel.json` achieves the same build behavior while staying in git history.

### 2026-07-26 — Stage S1: account-primary schema, multi-membership RLS correctness

**Context.** `matos_mobile_plan.md` §2.2 specifies a new `memberships` table (user_id, gym_id, role, joined_at, active) so a user can belong to more than one gym — most immediately, so a solo athlete's personal workspace (`gyms.kind = 'personal'`, §2.1) and a real gym membership can coexist on the same account. But every existing RLS helper function (`private.my_gym_id`, `my_member_id`, `my_role`, `is_coach_or_owner`, `is_owner`) and three trigger-level role guards (`enforce_member_role_insert_guard`/`update_guard`/`enforce_member_self_update_scope`) were written against a hard invariant that no longer holds once this ships: `members.user_id` carried a _global_ unique constraint, so `where user_id = auth.uid() limit 1` was always unambiguous. Relaxing that constraint to per-gym (required for the same account to hold two `members` rows) makes every one of those `limit 1` lookups genuinely ambiguous the moment any user has two memberships, not just theoretically so.

**Decision.** Fixed the ambiguity at the schema gate (this stage), not deferred to Stage S2 (which only owns the UI for switching gyms per the plan's own stage breakdown). Added `memberships.is_current boolean` — not in the plan's literal column list — with a partial unique index (`on memberships (user_id) where is_current`) enforcing at most one current membership per user as a real database invariant, not application discipline. Rewrote the five RLS helper functions to resolve via `memberships where user_id = auth.uid() and is_current` instead of the old unscoped `members` lookup. Added `public.set_active_gym(p_gym_id)`, a SECURITY DEFINER RPC that atomically unsets the old current row and sets the new one after validating the caller actually has an active membership for that gym — the only sanctioned way `is_current` can change (no client write policy on `memberships` touches it at all). Kept `members.role`, not `memberships.role`, as the sole source every permission check reads — `memberships.role` is a denormalised snapshot for future "gyms I'm in" list UI only. Rescoped the three trigger-level role guards to `new.gym_id` (the row being written) rather than the caller's active gym, since a write guard's question is "what's my role in the gym this row belongs to," not "what's my role in whichever gym I currently have selected" — a subtly different scope than the read-path helpers, deliberately not copy-pasted from them. Backfilled one `is_current = true` memberships row for every existing linked `members` row, so every current single-membership user resolves identically to before this migration. Separately, added `breakdowns.visibility` (`private`/`gym`, default `gym`) per §2.2, and discovered while writing the policy update that the two child tables (`breakdown_positions`, `breakdown_events`) had flat gym-scoped SELECT policies with no reference to their parent breakdown's visibility at all — a coach would have been unable to see a private breakdown's own row but still able to see its tagged positions/events directly. Closed via an `exists` join against `breakdowns.visibility = 'gym'` in both child policies, in the same migration, before it could ship as a gap.

**Reasoning.** This stage is explicitly BLOCKING-gated (security-reviewer + database-reviewer) specifically because it changes the foundation every other RLS policy in the app sits on; shipping the schema/column-list part of the plan while leaving the now-ambiguous helper functions unfixed would pass a superficial "does the schema match §2.2" read while leaving a live correctness gap under every existing policy the moment any account gets a second membership — exactly the kind of half-fix the gate exists to catch, so fixing it here rather than waiting for S2 to notice isn't scope creep, it's what the gate is for. Verified live post-migration (not just "applied without error"): a coach and an unrelated-gym athlete were both signed in via real auth sessions post-migration, and each correctly resolved only their own gym's members/memberships/breakdowns through the rewritten helpers — including a same-gym duplicate `(gym_id, user_id)` insert being correctly rejected by the new constraint, confirming the old global-unique constraint was actually dropped and not just shadowed by the new one.

**Alternatives considered.**

- _Defer the helper-function fix to Stage S2, ship S1 as schema-only per the plan's literal column list:_ rejected — S2's own stated deliverable is the _UI_ for switching active gym, not RLS correctness; deferring would mean the BLOCKING gate reviews a migration that is schema-complete but security-incomplete, the exact failure mode the gate is meant to catch before Stage S2 application code ever depends on it.
- _Let `memberships.role` be the authoritative permission-check source going forward, migrating `members.role` reads to it:_ rejected — every existing app code path (RLS policies, trigger guards, the agent's tools, the UI) already reads `members.role`; introducing a second authoritative source this late risks drift between the two, which is a privilege-escalation-shaped bug class, for no correctness benefit `memberships.is_current` doesn't already provide.
- _Scope the trigger-level guards to the caller's active gym (`private.my_gym_id()`), matching the read-path helpers exactly:_ rejected — a guard on an insert/update to a specific `members` row needs to check the actor's role _in that row's gym_, which for a coach mid-switch (or acting via a future admin/cross-gym flow) isn't guaranteed to equal their currently-active gym; `new.gym_id` is the correct scope for a write guard even though it looks like an inconsistency next to the helper functions at a glance.
- _Add a public SELECT-resolution mechanism for `share_links` now, since the table exists in this migration:_ rejected — deferred to Stage S3 deliberately (see the migration's own header notes), which owns the actual public share page and gets its own dedicated security review specifically because it's the app's first genuinely public-facing surface; building the resolution function without that page and review context risks under-scoping what it needs to redact.

**Gate outcome and re-verification.** The BLOCKING gate's first pass on this migration was not clean: both security-reviewer and database-reviewer independently caught the same CONFIRMED/BLOCKED finding — the rewritten helper functions had silently dropped the `and active` filter that `20260716130000_rls_active_member_check.sql` added specifically to stop a deactivated member's still-live auth session from retaining data access (that migration's own header explains why: flipping `members.active` doesn't revoke the Supabase Auth session itself). database-reviewer additionally caught a second CONFIRMED/BLOCKED finding: the live invite-claim route (`api/invite/[token]/claim`) only ever writes `members.user_id`, with nothing populating the new `memberships` table — every new invite claim from this migration onward would have silently produced a user with zero memberships rows (auth works, app renders empty, no error surfaced anywhere). Both were fixed before this migration was considered complete: the five helper functions were rewritten again to join `memberships` to `members` in a single query each (fixing the dropped `active` check and, per a MEDIUM finding, eliminating a redundant nested `my_gym_id()` call inside each of the other four — SECURITY DEFINER functions are never planner-inlined, so the nesting was a genuine double lookup across every one of the dozens of existing policies that compose these functions); a new `members_sync_memberships` trigger now upserts a `memberships` row whenever `members.user_id` is newly set, closing the invite-claim gap at the DB layer rather than patching that one call site. Two more MEDIUM/LOW items from the same passes were folded into the same fix: `set_active_gym()` gained a `pg_advisory_xact_lock` to serialize concurrent calls for the same user (previously a real, if narrow, race against the partial unique index), and a redundant `memberships_user_id_idx` was dropped (already covered by the composite `memberships_user_gym_unique (user_id, gym_id)` index's leftmost prefix). All fixes were re-applied live (via `supabase db query --linked`, not a second migration file, since the original was neither committed nor yet gate-passed) and re-verified both by re-running the full BLOCKING gate (both reviewers passed clean on the second pass) and by direct behavioral test: an active coach's access was confirmed unchanged, then the same coach was deactivated via service-role and confirmed to correctly lose all data access (0 members, 0 gyms visible) — the exact scenario the original fix and this regression were both about.

Both re-verification passes independently flagged the same two LOW/informational items, neither rising to blocking, both explicitly forward-looking rather than current gaps: (1) `members_sync_memberships` only handles the link direction (`user_id` set from null) — if a future flow ever unlinks a user (`user_id` set back to null) or reassigns a member row to a different user, the trigger doesn't clean up the old `memberships` row; harmless today since no such flow exists anywhere in the codebase (the stale row grants no access, since the helper functions require matching `members.user_id`), but worth a deliberate look whenever a future stage first builds an unlink/reassign path. (2) `set_active_gym`'s advisory lock key (`hashtext(auth.uid()::text)`) uses a 32-bit hash, so two unrelated users could theoretically collide into the same lock bucket — a pure lock-contention/performance nit (the actual one-current-membership invariant is still enforced independently by the partial unique index regardless), not a security concern, and not worth the complexity of a wider key unless this RPC ever sees meaningful concurrent traffic.
