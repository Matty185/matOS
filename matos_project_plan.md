# MatOS — Alpha Build Project Plan

**Version:** 1.0
**Status:** Ready for execution via Claude Code
**Derived from:** Full requirements interview, 137 decisions locked
**Companion file:** CLAUDE.md (drop into repo root)

---

## 1. Project Definition

MatOS is a multi-tenant BJJ gym management platform. The alpha is a **functional demo pushed to its limits** — seeded with fictional data (demo gym: "Northside BJJ"), demonstrating full coach and athlete workflows including an agentic natural-language interface, with a stubbed AI video analysis feature. The demo audience is a potential technical collaborator and, later, the gym coach as first unpaid alpha tester.

**Alpha success criteria:** Good user flow for key BJJ gym management use cases, even where endpoints are stubs. Edge cases and graceful error handling demonstrated in the agentic interface.

### In Scope (Alpha)

- Member profiles (contact, photo, belt, join date, notes)
- Belt and stripe tracking with promotion history (adult + kids belts)
- Attendance — coach manual marking + athlete self check-in (logged-in button per class)
- Class schedule management (recurring classes, template model)
- Payment status tracking (manual, no processing), automatic overdue computation
- Overdue payment alerts
- Agentic natural language interface for coach (Claude Haiku, tool use, confirmations)
- Athlete portal (own data only)
- Athlete video upload stub → mock analysis report
- Athlete personal logs (working on / struggling with), visible to coach by default
- Audit log of all writes, visible in UI as troubleshooting tool
- GDPR: consent at registration, data export (JSON download), deletion request flow
- Notifications table as infrastructure (no UI, no email sending)
- Multi-gym data model from day one (single gym in UI)
- Mobile-responsive, PWA-ready
- Seeded demo data

### Out of Scope (Alpha)

- Real video analysis (stub only — mock report after simulated delay)
- Payment processing (Stripe/GoCardless) — data model accommodates later
- Email sending (invite emails ARE sent via Resend; notification emails are not)
- React Native app (documented next step; web is PWA-ready)
- Testing suite (deferred)
- Sentry (console logging only)
- Staff/admin role (future)
- Per-session class instances (class template model for alpha — **flagged for early refactor**)
- Waitlists, capacity enforcement UI

---

## 2. Tech Stack (Locked)

| Layer           | Choice                                             | Notes                                                                   |
| --------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| Runtime         | Node 20 LTS                                        |                                                                         |
| Package manager | npm                                                |                                                                         |
| Framework       | Next.js 14 App Router, TypeScript strict           | `strict: true`, `noUncheckedIndexedAccess: true`                        |
| Styling         | Tailwind CSS + shadcn/ui                           | Deep navy primary `#1B4F72`                                             |
| Typography      | Inter (body) + Bebas Neue (headings)               |                                                                         |
| DB/Auth/Storage | Supabase (Postgres + RLS + Auth + Storage)         | Storage for photos/docs only — **no video ever stored**                 |
| Data fetching   | TanStack Query                                     | No global client state lib; useState for UI state                       |
| Forms           | React Hook Form + Zod                              | Zod schemas shared client/server as validation source of truth          |
| Dates           | date-fns                                           |                                                                         |
| AI              | Claude API — Haiku 4.5 for agent                   | Full response (non-streaming) for alpha                                 |
| Email           | Resend                                             | Invite emails only                                                      |
| Deployment      | Vercel                                             | Deploy from Stage 3; previews on branches                               |
| PWA             | next-pwa                                           | Placeholder icons 192/512, theme `#1B4F72`                              |
| Lint/format     | ESLint (Next config) + Prettier + husky pre-commit |                                                                         |
| Agent harness   | ECC (github.com/affaan-m/ECC)                      | security-reviewer, code-reviewer, database-reviewer, planner, architect |
| Repo            | GitHub, private                                    | Collaborator added when ready                                           |

---

## 3. Data Model

All tenant tables carry `gym_id` FK, indexed. All timestamps `timestamptz`. UUIDs as PKs.

### gyms

`id, name, address, contact_email, logo_url, created_at, active`

### members

`id, gym_id, user_id (nullable — claimed inferred from non-null), first_name, last_name, email, phone, emergency_contact_name, emergency_contact_phone, photo_url, join_date, belt, stripes, membership_plan (monthly|casual|comp_team), notes, active, created_at, updated_at`

**Belt enum (single list, kids + adult):** white, grey_white, grey, grey_black, yellow_white, yellow, yellow_black, orange_white, orange, orange_black, green_white, green, green_black, blue, purple, brown, black. Kids appear in the same member list; belt colour rendered by `<BeltDisplay />`.

### belt_history

`id, member_id, gym_id, belt, stripes, promoted_at, promoted_by (user_id), notes`

### classes (template model — refactor to sessions model planned early post-alpha)

`id, gym_id, name, class_type (gi|no_gi|comp|open_mat), day_of_week, start_time, duration_minutes, max_capacity (nullable), active`

### attendance

`id, member_id, class_id, gym_id, checked_in_at, checked_in_by (self|coach)`
Attendance is logged against the class template + date (derived from checked_in_at).

### payments

`id, member_id, gym_id, period_month (int), period_year (int), amount (nullable decimal), status (paid|unpaid|waived), paid_at (nullable), notes, recorded_by`
**Overdue is computed at query time, never stored:** status = unpaid AND period end < today (June becomes overdue July 1 exactly, no grace). Coach can set `waived` regardless.

### audit_log (immutable)

`id, gym_id, actor_id, action, entity_type, entity_id, before_state (jsonb), after_state (jsonb), timestamp, initiated_by (coach_manual|agent), agent_query (text, nullable — raw NL query when agent-initiated)`
Writer includes scrubbing logic: never log passwords, tokens, raw invite tokens, or post-deletion identifying info.

### analyses (video analysis stubs)

`id, member_id, gym_id, title, analysed_at, status (pending|complete|failed), report (jsonb — placeholder fields fine), created_by, visible_to_athlete (boolean)`

### athlete_logs

`id, member_id, gym_id, entry_date, working_on, struggling_with, notes, visible_to_coach (boolean, default TRUE)`

### gdpr_consents

`member_id, data_storage_consent, consented_at, consent_version`

### invites

`id, member_id, gym_id, token_hash, expires_at (7 days), claimed_at (nullable), created_by`
Single use; resend invalidates old token; claim endpoint max 5 attempts per token then invalidated.

### notifications (infrastructure only, no UI)

`id, gym_id, recipient_user_id, type, payload (jsonb), read, created_at`

### deletion_requests

`id, member_id, gym_id, requested_at, executed_at (nullable), executed_by (nullable)`

### agent_rate_limits

`user_id, date, query_count` — soft warning at 40, hard block at 50/day.

---

## 4. Roles & RLS

**Roles:** `gym_owner` > `coach` > `athlete`. Owner = coach permissions + manage coach profiles + gym settings. Coach = full member/attendance/payments/belts/agent. Athlete = own data only.

RLS enforced at DB layer (never application-only). Summary per table:

| Table         | Coach/Owner                                                             | Athlete                                                                            |
| ------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| gyms          | SELECT own gym; UPDATE owner only; INSERT service role; DELETE disabled | —                                                                                  |
| members       | Full CRUD in gym (DELETE disabled — deactivate)                         | SELECT own row; UPDATE own contact fields only                                     |
| attendance    | Full in gym                                                             | SELECT/INSERT own (class must be own gym)                                          |
| payments      | SELECT/INSERT/UPDATE in gym; DELETE disabled                            | SELECT own, **status only — amount hidden** (RLS + server-side filter, two layers) |
| belt_history  | INSERT/UPDATE in gym; DELETE disabled                                   | SELECT own                                                                         |
| audit_log     | SELECT only; INSERT service role only; immutable                        | No access                                                                          |
| analyses      | Full in gym; DELETE disabled                                            | SELECT own where visible_to_athlete                                                |
| athlete_logs  | SELECT in gym where visible_to_coach                                    | Full CRUD own rows                                                                 |
| notifications | SELECT/UPDATE(read) own                                                 | Same                                                                               |

**Never returned to client:** service role key, password data, other athletes' data, amount on athlete payment queries.

---

## 5. API Surface

Next.js App Router routes. Every route wrapped in `withAuth(handler, requiredRole?)` middleware validating: session → gym_id match → role → input (Zod) → rate limit (agent only). Consistent error shape: `{ error, code, status }`. Confirmed writes from the agent go through the **RESTful resource endpoints directly** (client extracts tool params) — not back through /api/agent.

```
/api/members            /api/members/[id]           /api/members/[id]/attendance
/api/members/[id]/payments   /api/members/[id]/belt-history
/api/members/[id]/analyses   /api/members/[id]/logs
/api/classes            /api/attendance             /api/payments
/api/agent              /api/invite                 /api/invite/[token]
/api/invite/[token]/claim    /api/auth/[...supabase]
/api/audit              /api/gym                    /api/video/upload
```

**Supabase clients:** browser client (RLS-respecting) for client queries; server client with service role key (env only, never bundled) for invite generation and seeding only. Agent tools use the RLS client exclusively.

**Video upload stub:** accepts multipart video ≤500MB, validates type, never writes to storage, creates `analyses` row (pending), UI polls, row flips to complete with mock report. Upload limit: 3/gym/day.

**Invite flow:** POST /api/invite → random UUIDv4 token, stored hashed, 7-day expiry, Resend email → GET validates → POST claim sets password, links user_id, single-use.

---

## 6. Agentic Interface Specification

**Model:** Claude Haiku 4.5. **UI:** floating button (React portal, fixed position) → chat panel. In-session history only (client-side, passed per request); permanent record via audit log. **Tone:** terse and functional ("Done. John Murphy marked as paid for June."). **Response mode:** full response, non-streaming.

**Context injected server-side per call:** gym name, current date, coach name, active member count, overdue count. `gym_id` injected server-side — never taken from model output. Tool params validated server-side regardless of model output. Tool results passed as structured JSON (not prompt-interpolated); system prompt marks member data as untrusted; output validated against response schema before render (never raw HTML).

**Read tools (execute immediately):** get_members, get_member, get_attendance, get_payments, get_classes, get_belt_history, get_overdue_payments, get_audit_log, get_analysis_stubs

**Write tools (confirmation required):** update_payment_status, update_member, update_belt, create_class, deactivate_member, create_attendance

**Behaviours (all demoed):**

- Multi-step chaining: "mark all overdue as paid" → query → one batched confirmation
- Disambiguation: two Johns → agent lists options with distinguishing detail, coach clarifies (counts as 2 queries)
- Destructive actions (deactivate_member): **typed confirmation** ("yes"/"confirm"), extra audit detail
- Ambiguous intent: default to full profile, offer drill-down
- Out of scope: brief friendly redirect listing real capabilities, no apology
- Failed execution: "Something went wrong — the change wasn't saved." Raw errors server-logged only
- Rate limit: warning banner at 40, hard block at 50 with reset-at-midnight message

**Request/response:** POST /api/agent `{query, conversation_history, gym_id}` → `{type: 'answer'|'confirmation'|'error', content, tool_call?}`.

---

## 7. Screens

### Coach

- **Dashboard:** summary cards (active members, classes this week, overdue count, today's check-ins), quick actions, recent activity feed (last 10 audit entries in plain English), flags (overdue, not seen 30+ days)
- **Member list:** searchable/filterable table (belt, plan, payment status, active), bulk mark-paid, row → profile
- **Member profile:** header (photo, BeltDisplay, plan, status) + tabs: Overview (contact, emergency, consent status, invite claimed/unclaimed) / Attendance (list + avg-per-week stats) / Payments (monthly grid) / Belt History (timeline) / Analysis (stub reports, expandable) / Logs. Actions: edit, resend invite, deactivate, promote belt
- **Add/edit member:** single form; on add, invite email sent automatically
- **Attendance page:** today's classes, expandable attendee lists, manual marking, date picker for history; **Supabase realtime** — check-ins appear live
- **Class management:** recurring class CRUD; full weekly schedule set up in under 5 minutes
- **Payments page:** gym-wide grid (members × months, colour-coded)
- **Belt promotion:** select belt/stripes, notes, confirm → updates member + history + audit + **simple celebration animation**
- **Gym settings (owner):** gym details, logo, coach management, danger zone, GDPR section
- **Audit log:** last 200 entries, filterable (date/actor/action), plain-English actions

### Athlete

- **Home:** welcome, BeltDisplay, attendance streak, upcoming classes
- **Check In:** today's classes, per-class button; window opens 30 min before start, closes at class end; duplicate = "already checked in"; outside window = friendly message
- **My Attendance / My Progress:** history, belt timeline, personal logs (CRUD)
- **Upload:** video stub → loading → mock report
- **Settings:** edit contact, change password, **request my data** (JSON download), **request account deletion**

**Universal:** proper empty states with actions on every list view; loading states on every async action; toasts for transient errors, inline for validation, fallback error page; everything works at 390px, 44px touch targets, WCAG AA contrast.

**GDPR deletion flow:** athlete requests → deletion_requests row + coach in-app notification record → coach executes from gym settings → member anonymised ("Deleted Member", email cleared, user_id unlinked), attendance/logs/analyses deleted, payments retained anonymised, audit retained with actor anonymised.

---

## 8. Security Non-Negotiables

1. RLS on every table; no public SELECT anywhere
2. gym_id present + indexed on every tenant table
3. withAuth on every route; server-side session + gym + role validation (client checks are UX only)
4. Service role key server-only; agent never touches it
5. Invite tokens hashed, 7-day expiry, single-use, 5-attempt limit
6. Audit log immutable, service-role INSERT only, scrubbed
7. Security headers in next.config.js: X-Frame-Options DENY, nosniff, strict referrer, restrictive CSP (Supabase + Anthropic domains only)
8. All input Zod-validated server-side; no raw SQL (Supabase client parameterises)
9. Prompt injection defences per Section 6

---

## 9. ECC Agent Workflow

Install ECC plugin; use existing agents rather than custom prompts: **security-reviewer** (schema, RLS, routes, auth), **code-reviewer** (critic role — reviews implementations against this plan), **database-reviewer** (Supabase specifics), plus a UX review prompt (custom — checklist in Section 7 universal requirements + mobile standards).

**Trigger points:** after Stage 1 (security + database reviewers — BLOCKING); after each major module Stages 4–8 (all reviewers); before demo (full pass). Security/critic BLOCKED items halt the build; UX BLOCKED items logged for polish pass.

**Report format:** `AGENT / MODULE / DATE / PASSED / FLAGGED (issue + fix) / BLOCKED (must resolve)`.

**Security checklist (per review):** every table RLS-enabled; no public SELECT; gym_id indexed everywhere; cascades disabled where retention required; sensitive fields excluded from athlete queries; withAuth everywhere; server-side gym_id validation; service role only where necessary; input validation on writes; error responses leak nothing; agent gym_id server-injected; tool params validated; prompt injection mitigations present; tokens hashed with expiry and claim rate limit.

**Critic checklist:** all in-scope features implemented; every Section 7 flow reachable; every Section 6 edge case handled; seed data covers demo scenarios; empty/error states everywhere; PWA manifest + responsiveness verified; GDPR consent at registration; export + deletion reachable.

---

## 10. Build Sequence

| Stage | Content                                                                                                                                                                                                                                                            | Gate                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 0     | Repo, Next.js init, Supabase project, ECC install, CLAUDE.md, env vars, Tailwind + shadcn/ui, PWA config, ESLint/Prettier/husky                                                                                                                                    | —                                                  |
| 1     | Full schema + all RLS + migrations                                                                                                                                                                                                                                 | **security-reviewer + database-reviewer BLOCKING** |
| 2     | Auth, withAuth middleware, roles, invite + claim flow, GDPR consent at registration                                                                                                                                                                                | security review                                    |
| 3     | Coach dashboard shell, nav, routing, empty states. **First Vercel deploy — live URL from here on**                                                                                                                                                                 |                                                    |
| 4     | Members module (list, profile, tabs, add/edit, promotion + celebration)                                                                                                                                                                                            | all reviewers                                      |
| 5     | Attendance module (classes, marking, athlete check-in, realtime)                                                                                                                                                                                                   | all reviewers                                      |
| 6     | Payments module (grid, per-member, computed overdue, alerts)                                                                                                                                                                                                       | all reviewers                                      |
| 7     | Agentic interface (button, panel, tools, confirmations, rate limit, audit, edge cases)                                                                                                                                                                             | all reviewers                                      |
| 8     | Athlete portal (all screens, logs, upload stub, GDPR settings)                                                                                                                                                                                                     | all reviewers                                      |
| 9     | Seed script (`scripts/seed.ts`, npx tsx, re-runnable wipe+reseed): Northside BJJ, 1 owner + 1 coach, 18 members varied belts/plans/join dates, 3 months realistic attendance, mixed payment statuses, 3–4 promotions, 2 mock analyses, athlete logs on 3–4 members |                                                    |
| 10    | Polish: empty/error states, responsiveness audit, PWA manifest, UX review                                                                                                                                                                                          |                                                    |
| 11    | Full ECC review pass; resolve all BLOCKED                                                                                                                                                                                                                          | **BLOCKING**                                       |
| 12    | Demo prep: walkthrough script, demo accounts, final deploy                                                                                                                                                                                                         |                                                    |

**Every stage checkpoint:** working locally, no console errors, mobile check passed, relevant agent review done, committed + pushed to main.

---

## 11. Execution Workflow

1. Stage 0 manually with Claude Code assistance
2. Drop CLAUDE.md into repo root
3. `/plan "Build MatOS alpha Stage N"` per stage → review blueprint → execute
4. Run ECC reviewers at gates; paste relevant files or let Claude Code drive
5. Never proceed past a BLOCKED item from security or critic

## 12. Known Deferred Items (documented, not forgotten)

- Class template → class_sessions refactor (soon after alpha)
- React Native app (Expo) — web is PWA-ready by design
- Email notifications (table exists, no sending)
- Payment processing integration + its compliance conversation
- Real video analysis pipeline (no-storage model per platform overview doc)
- Testing suite
- Sentry
- Staff role
- 2FA (Supabase Auth chosen partly for this upgrade path)
