# CLAUDE.md — MatOS

Persistent context for Claude Code and all ECC agents working on this repository. Read fully before any task. The companion document `matos_project_plan.md` contains the complete specification — this file is the operational summary. Where they conflict, the project plan wins.

## What This Is

MatOS is a multi-tenant BJJ gym management platform. Current phase: **alpha** — a functional demo with seeded fictional data (demo gym "Northside BJJ"), built for a technical collaborator demo and a first unpaid gym tester. Core differentiator: a natural-language agentic interface for coaches, plus a stubbed AI video analysis feature (real pipeline is a later phase — **no video is ever stored, process-and-discard model**).

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

## Decision Log

### 2026-07-15 — Node version pin: 20 → 24

**Context.** CLAUDE.md and `package.json` (`engines`) pinned Node 20 LTS. Node 20 reached EOL 2026-04-30 (no further security patches). The local dev machine has been running Node 24.18.0 the entire time regardless of the pin, causing `EBADENGINE` warnings on every `npm install`. Node 22 (Active LTS, → Maintenance ~Oct 2026, EOL Apr 2027) and Node 24 (Active LTS, EOL Apr 2028, now Vercel's default for new projects) were the live options.

**Decision.** Pinned to Node 24 (`engines: ">=24 <25"`, `@types/node: ^24`).

**Reasoning.** The dev environment and almost certainly CI/Vercel builds have already been running on Node 24 in practice, so this pin change codifies the status quo rather than introducing a new untested runtime — Node 22 would mean adopting a _third_, still-unexercised version. Node 24 also has the longest runway (Apr 2028) of the two live options and is Vercel's new default, minimizing future churn for a solo-maintained alpha. Flagging per CLAUDE.md's "do not deviate without flagging" clause: this was resolved autonomously while the human was AFK; no code changes beyond the version pin were made, and a build/smoke test against Node 24 is still recommended before the next deploy.

**Alternatives considered.**

- _Node 22 (conservative Active LTS):_ rejected — less runway than 24, and would still be a version never actually run locally, so it doesn't remove the drift between documented and actual runtime.
- _Install Node 20 via nvm to match the existing pin:_ rejected — reinstalling an EOL, unpatched runtime for a network-facing demo app (Supabase Auth, Claude API, invite emails) to preserve a stale pin has real downside and no upside; "flag deviations" is satisfied by this log entry, not by manually enforcing a dead version.
