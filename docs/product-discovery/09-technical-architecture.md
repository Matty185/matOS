# 09 — Technical architecture

Audit date 2026-11-05. All facts below come from files in the repo (paths given). No secrets are reproduced; environment variables are listed by **name only**.

## 1. Stack

| Layer              | Technology                                                                                                                                                                                        | Evidence                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Monorepo           | npm workspaces: `apps/web`, `apps/mobile`, `packages/shared`                                                                                                                                      | `package.json`                                                                            |
| Runtime            | Node 24 LTS                                                                                                                                                                                       | `package.json` engines                                                                    |
| Web framework      | Next.js 14.2.35 (App Router), React 18.3, TypeScript strict                                                                                                                                       | `apps/web/package.json`                                                                   |
| UI (web)           | Tailwind CSS 3 + shadcn/ui (Radix primitives), lucide-react icons, sonner toasts                                                                                                                  | `apps/web/tailwind.config.ts`, `components/ui/*`                                          |
| Forms / validation | React Hook Form + Zod 4 (schemas shared client/server in `packages/shared/src/validation`)                                                                                                        |                                                                                           |
| Server state       | TanStack Query 5                                                                                                                                                                                  |                                                                                           |
| Mobile             | Expo SDK 57, React Native 0.86, React 19.2, expo-router, NativeWind 4                                                                                                                             | `apps/mobile/package.json`, `app.json`                                                    |
| Database           | Supabase Postgres, Row-Level Security on every table, 46 migrations, ~124 RLS policies                                                                                                            | `supabase/migrations/`                                                                    |
| Auth               | Supabase Auth (email + password). Web: cookie session via `@supabase/ssr`; mobile: bearer token, accepted by the same API routes                                                                  | `apps/web/src/lib/supabase/server.ts`, `lib/auth/withAuth.ts`, `lib/auth/bearer-token.ts` |
| File storage       | Supabase Storage, two **private** buckets: `member-photos`, `gym-logos` (2 MB, JPEG/PNG/WebP)                                                                                                     | `supabase/migrations/20261104150000_photos_logo.sql`                                      |
| AI                 | Anthropic Claude Haiku 4.5 via `@anthropic-ai/sdk`, non-streaming, tool use                                                                                                                       | `apps/web/src/app/api/agent/route.ts`, `lib/agent/*`                                      |
| Email              | Resend (invites, new-trial alert) — **switched off** until a domain is verified                                                                                                                   | `lib/email/*`, `matos_email_setup.md`                                                     |
| Push               | Expo push service, sent from web API routes                                                                                                                                                       | `apps/web/src/lib/push/send-push.ts`                                                      |
| Payments           | Stripe Payment Links (owner pastes the link; MatOS never calls Stripe)                                                                                                                            | `supabase/migrations/20261104160000_plan_payment_links.sql`, `lib/payments/pay-link.ts`   |
| Hosting            | Vercel (`vercel.json` builds `apps/web`); PWA via `next-pwa`                                                                                                                                      | `vercel.json`, `public/manifest.json`                                                     |
| Tooling            | ESLint, Prettier, husky + lint-staged                                                                                                                                                             | `package.json`                                                                            |
| Tests              | **None.** No test files exist; "testing is deferred" is a stated project rule (`CLAUDE.md`). Verification has been done with ad-hoc live scripts and browser checks recorded in the Decision Log. |                                                                                           |

Environment variable names used by the web app (from `apps/web/.env.local.example` and code): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` (CLI/migrations only), `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`, `INVITE_EMAIL_ENABLED`, `INVITE_FROM_ADDRESS`. Mobile: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL` (names from `.env.local.example` files).

## 2. Application structure (web)

- **Route groups:** `(coach)` — dashboard, members, attendance, promotions, classes, announcements, trials, drop-ins (Visitors), payments, reports, analysis, audit log, settings; `(athlete)` — home, timetable, check-in, progress, waiver; plus `family`, `account`, `analysis/*`, `setup`.
- **Public routes (no login):** `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/invite/[token]`, `/join/[token]`, `/trial/[code]`, `/share/[token]`, `/kiosk`, `/kiosk/setup`.
- **API:** 76 route handlers under `apps/web/src/app/api/`, each wrapped in `withAuth(handler, { requiredRole, schema })` (session → current membership → role → Zod validation); errors as `{ error, code, status }`.
- **Two Supabase clients:** a user client (RLS applies) for everything users do; a service-role client only for a documented list (invites, audit writes, signup, GDPR, public share/trial/kiosk resolution, storage cleanup, operator script) — `CLAUDE.md` Rule 4.

## 3. Data model (tables)

Tenant boundary: almost every table has `gym_id` (indexed). A "gym" is either a real gym (`kind = 'gym'`) or a one-person personal workspace (`kind = 'personal'`).

| Domain               | Tables                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Tenancy & people     | `gyms`, `members` (role: gym_owner / coach / athlete / guardian), `memberships` (user ↔ gym, `is_current`), `member_guardians` |
| Onboarding & access  | `invites`, `signup_links`, `kiosk_devices`, `gdpr_consents`, `deletion_requests`                                               |
| Classes & attendance | `classes`, `class_session_changes`, `attendance`, `drop_in_visits`                                                             |
| Progression          | `belt_history`                                                                                                                 |
| Money                | `gym_plans`, `payments`, `membership_holds`                                                                                    |
| Communication        | `announcements`, `notifications` (unused), `push_tokens`                                                                       |
| Growth               | `trial_leads`                                                                                                                  |
| Compliance           | `waiver_versions`, `waiver_signatures`, `audit_log` (immutable)                                                                |
| Match analysis       | `breakdowns`, `breakdown_positions`, `breakdown_events`, `event_types`, `positions`, `external_people`, `share_links`          |
| Platform             | `agent_rate_limits`, `athlete_logs`, `entitlements` (unused)                                                                   |

Key database functions: `current_member`, `set_active_gym`, `import_members`, `add_guardian`, `redeem_signup_link`, `promotion_progress`, `class_headcounts`, `class_coach_names`, `tag_position`, `increment_agent_query_count`.

Design choices worth knowing:

- **Classes are templates** (weekly recurring) with per-date exceptions, not per-session rows — simple, but booking/waitlists would need a refactor.
- **Overdue is computed at query time**, never stored (Rule 8).
- **Audit log is append-only**, enforced by trigger.
- **Business rules in the database** where security matters: capacity (advisory-locked trigger), a gym can never lose its last owner (deferred constraint trigger), athletes can't edit their own plan/photo/belt (self-update guard).

## 4. Mobile app (`apps/mobile`)

Screens (`src/app`): auth (login, signup, invite), Home, Check-in, Progress (attendance, belt history, logs), Analysis (list, new, detail, tag, record, athlete profile, compare, external people), Account. It reads directly from Supabase under RLS and writes through the web API with a bearer token. Offline: tagging drafts in local files with a sync engine; check-ins queued in AsyncStorage.

**Status:** built through stage M9 (store prep) but **parked** by the founder. It has never been built for a real device: no EAS project, no TestFlight/Play build. It was rendered for this audit in Expo's web mode only. It predates several web features (no timetable, announcements, membership card, waivers, family view, capacity counts).

## 5. Integrations

| Service               | Purpose                                                       | State                          |
| --------------------- | ------------------------------------------------------------- | ------------------------------ |
| Supabase              | DB, auth, storage, realtime (attendance page)                 | Live                           |
| Vercel                | Hosting (single production URL on a `vercel.app` subdomain)   | Live                           |
| Anthropic             | Coach assistant                                               | Live (key replaced 2026-11-05) |
| Resend                | Email                                                         | Off — no domain                |
| Expo push             | Mobile notifications                                          | Code only                      |
| Stripe                | Payment Links (no API integration)                            | Live, owner-configured         |
| WhatsApp / SMS / mail | `wa.me`, `sms:`, `mailto:` links opened on the coach's device | Live                           |

## 6. Implementation maturity

- **Strong:** security model (RLS everywhere, layered reviews per stage with a written Decision Log), GDPR flows, onboarding, BJJ-specific progression logic, gym-timezone correctness.
- **Thin:** no automated tests; no CI; no error monitoring (console logging only); Next 14 pinned with open `npm audit` advisories (accepted for alpha); single region; no staging environment — development runs against the production database.
- **Defect found:** belt colours stripped from CSS (see `02-feature-inventory.md`).
