# 10 — Security, data handling and internationalisation

This is a description of controls found in the code and the project's own review history. No penetration testing was done for this audit.

## 1. Security controls (verified in code)

| Control          | How                                                                                                                                                                                 | Evidence                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Authentication   | Supabase Auth, email + password; sessions via cookies (web) or bearer token (mobile)                                                                                                | `lib/supabase/server.ts`, `lib/auth/withAuth.ts`                                          |
| Authorisation    | Postgres RLS on every table (~124 policies) is the boundary; API routes add role checks and Zod validation                                                                          | `supabase/migrations/*`, `CLAUDE.md` Rules 2 and 5                                        |
| Tenant isolation | `gym_id` on tenant tables; helpers resolve the caller's _current, active_ membership; deactivating a member cuts access even with a live session                                    | `20260716130000_rls_active_member_check.sql`, `20260726120000_account_primary_schema.sql` |
| Privilege guards | Users can't change their own `user_id`/role/plan/photo; a gym can't lose its last owner; only owners manage staff                                                                   | onboarding and guard migrations (`20261030*`, `20261101130000`)                           |
| Service-role use | Restricted to a documented list (invites, audit, signup, GDPR, public share/trial/kiosk, storage cleanup, operator script)                                                          | `CLAUDE.md` Rule 4                                                                        |
| Secrets in links | Invite, sign-up, kiosk, share and reset tokens are random; only SHA-256 hashes are stored; single-use or expiring; minting is audited first                                         | `lib/auth/invite-token.ts`, kiosk/signup migrations                                       |
| Audit log        | Immutable, scrubbed of passwords/tokens; includes the raw assistant query                                                                                                           | `lib/audit/log.ts`                                                                        |
| AI safety        | `gym_id` injected server-side; model output schema-validated; all writes need coach confirmation; typed confirmation to deactivate; member text treated as untrusted                | `lib/agent/*`                                                                             |
| Rate limits      | Assistant (per gym/day), kiosk check-ins, public trial form (per sender/contact/gym), sign-up link attempts                                                                         | relevant routes                                                                           |
| HTTP headers     | CSP (Supabase + Anthropic), X-Frame-Options DENY, nosniff, referrer policy                                                                                                          | `apps/web/next.config.mjs`                                                                |
| Payment data     | **No card data touches MatOS.** Members pay on Stripe's page; MatOS stores status and (coach-entered or plan) amounts only                                                          | `lib/payments/pay-link.ts`                                                                |
| File uploads     | Private buckets; path-checked routes; 2 MB, image types only; browser re-encode strips EXIF (a UI safeguard, not enforced server-side)                                              | photos migration                                                                          |
| Video            | Never uploaded; analysis uses local files only (a hard rule)                                                                                                                        | `CLAUDE.md` Match Analysis Non-Negotiable 1                                               |
| GDPR             | Consent capture, data export, erasure by anonymisation (covers ~20 tables incl. photos and drop-ins), self-serve deletion for solo accounts, 12-month retention for visitor records | `api/account/export`, `api/deletion-requests/[id]/execute`                                |

## 2. Accepted risks recorded by the project (from the Decision Log)

- CSP keeps `'unsafe-inline'` for scripts; Next 14.2.35 has open `npm audit` advisories (upgrade deferred).
- Without email, whoever holds an invite or sign-up link can claim it, including for an email address they don't own (bounded by single use, caps and audit).
- Coaches can issue password-reset links for athletes (so they could sign in as them). This is audited.
- An athlete or parent can read their own `payments.amount` through a direct API call (the app never shows it).
- Staff can read raw push tokens.

## 3. Areas needing further investigation

- **Backups and point-in-time recovery:** depends on the Supabase plan. Not visible in the repo.
- **No staging environment:** development and tests run against the production database.
- **No automated tests or CI;** no error monitoring.
- **Data residency:** the Supabase project region isn't visible in the repo (it matters for EU customers).
- **DPA, terms and privacy policy:** none in the repo.
- **Account security features:** no 2FA (out of scope), no SSO, no account lockout beyond Supabase defaults.

## 4. Internationalisation readiness

| Aspect        | State                                                                                                                           | Evidence                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| UI language   | English only, hard-coded strings; no i18n library                                                                               | no `i18n`/`next-intl` usage in `apps/*/src`             |
| Currency      | Euro assumed in display (`Intl.NumberFormat("en-IE", { currency: "EUR" })`); amounts are plain numerics with no currency column | `lib/payments/fees.ts`, reports page                    |
| Timezones     | ✅ Per-gym IANA timezone drives check-in windows, dates and reports (DST-safe)                                                  | `gyms.timezone`, `packages/shared/src/time/gym-time.ts` |
| Date formats  | Mostly `en-IE` formatting; weeks start Monday                                                                                   | various                                                 |
| Phone numbers | Messaging normalises to +353 when no country code is given (Ireland-specific default)                                           | `lib/messaging.ts`                                      |
| Addresses     | One free-text address field                                                                                                     | `gyms.address`                                          |
| Payments      | Stripe Payment Links (global); fee guidance in EUR                                                                              |                                                         |
| Tax           | None                                                                                                                            |                                                         |
| Terminology   | BJJ/IBJJF belt system incl. kids belts; "gi/no-gi"                                                                              | `packages/shared/src/belt`                              |

**Summary:** the timezone model is ready for any country. Currency, language, the phone default, tax and terminology are Ireland/English-first and would need work before a non-euro or non-English launch.
