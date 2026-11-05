# 02 — Feature inventory

Audit date: 2026-11-05. Source of truth: the code on `main` (commit `f3f1b5e`) and the live database schema (46 migrations in `supabase/migrations/`). "Verified" means exercised during development by live tests against the production database or by a browser check (recorded in `CLAUDE.md` → Decision Log); "code only" means present in code but not exercised end to end.

**Status key**

| Status                 | Meaning                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| ✅ Working             | Implemented, reviewed and verified live                                              |
| 🟡 Partial             | Works, with a known gap noted                                                        |
| 🔒 Built, switched off | Code is finished but disabled until something external exists (e.g. an email domain) |
| 📐 Designed only       | Schema or plan exists, no working feature                                            |
| ⛔ Not built           | Not in the codebase                                                                  |

**Platform key:** W = web app (`apps/web`), M = mobile app (`apps/mobile`, Expo; parked by the founder), — = none.

> **Critical defect found during this audit (not fixed — read-only task):** belt colours do not render on either platform. The belt colour classes moved to `packages/shared/src/belt/constants.ts`, but neither Tailwind config scans that folder (`apps/web/tailwind.config.ts` lines 6–10, `apps/mobile/tailwind.config.js` line 3), so classes such as `bg-blue-600` are stripped from the CSS. Every belt chip shows as grey/black (see `assets/web/members-list--desktop.png`). It's a one-line fix per app, but for a BJJ product it hits the most identity-defining element, so it should be fixed before any marketing screenshots are taken.

---

## A. Gym management

| Feature            | What it does                                                                                                                                                                                                                       | User               | Status        | Platform | Selling point?                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------- | -------- | ------------------------------- |
| Gym provisioning   | Operator script creates a real gym + owner invite link (`scripts/provision-gym.ts`). No public "create a gym" sign-up.                                                                                                             | Operator (founder) | ✅            | CLI      | No (internal)                   |
| Setup wizard       | 6 steps: gym details → timetable → coaches → members → invites → done (`components/shared/setup-wizard.tsx`).                                                                                                                      | Owner              | ✅            | W        | **Yes** — onboarding in ~20 min |
| Gym settings       | Name, address, contact email, IANA timezone, logo, promotion rules, plans & prices, sibling discount, drop-in fee, free-trial link, waiver, kiosk tablets (`app/(coach)/settings`).                                                | Owner              | ✅            | W        | Partly                          |
| Staff management   | Add coach, change role (owner/coach/athlete), owner-only staff (de)activation (`team-manager.tsx`, `api/team`).                                                                                                                    | Owner              | ✅            | W        | Standard                        |
| Multiple locations | —                                                                                                                                                                                                                                  | —                  | ⛔ (deferred) | —        | Gap vs enterprise competitors   |
| Multi-gym accounts | One login can belong to several gyms + a personal workspace; context switcher (`memberships`, `set_active_gym`).                                                                                                                   | All                | ✅            | W        | Unusual                         |
| Audit log          | Immutable log of every change incl. assistant actions, with readable descriptions (`app/(coach)/audit-log`, `lib/audit`).                                                                                                          | Owner/coach        | ✅            | W        | Trust/compliance                |
| Dashboard          | Counters (active members, classes, overdue, today's check-ins), quick actions, flags (overdue, not seen recently, waiver missing, ready for promotion, new trial requests), "you're teaching today", announcements, activity feed. | Coach/owner        | ✅            | W        | Yes                             |

## B. Athlete (member) management

| Feature                    | What it does                                                                                                                                                            | User                 | Status | Platform    | Selling point?              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------ | ----------- | --------------------------- |
| Member list                | Search, filters (belt, plan, payment status, sign-up status, waiver), badges (on hold, no waiver, invited/joined), bulk select, avatars.                                | Coach                | ✅     | W           | Standard                    |
| Add / edit member          | Contact, emergency/parent contact, plan, notes, starting rank + join date. Email optional (kids).                                                                       | Coach                | ✅     | W           | Standard                    |
| Roster import              | Paste from WhatsApp/Sheets/Excel or upload; flexible header aliases; validation preview; ≤300 rows (`packages/shared/src/import/roster.ts`).                            | Owner/coach          | ✅     | W           | **Yes** — fast switching    |
| Member profile             | Tabs: Overview, Attendance (calendar), Payments, Belt history, Analysis, Logs; message, promote, invite, password reset link, make coach, deactivate/reactivate, photo. | Coach                | ✅     | W           | Yes                         |
| Member photos              | Private storage; re-encoded in browser (EXIF stripped).                                                                                                                 | Coach                | ✅     | W           | Nice-to-have                |
| Parent / guardian accounts | Parent login linked to one or more children: check in, sign waiver, see progress & membership.                                                                          | Parent               | ✅     | W           | **Yes** for kids programmes |
| Deactivate / reactivate    | Soft delete; reactivation refused after GDPR erasure.                                                                                                                   | Coach                | ✅     | W           | Standard                    |
| Membership holds (freeze)  | Whole-month holds ≤12 months; frozen months never owed.                                                                                                                 | Coach                | ✅     | W           | Standard                    |
| Liability waivers          | Owner-written versioned text; signed in app, by parent on coach device, or recorded as paper; flag-only.                                                                | Owner/athlete/parent | ✅     | W           | Expected                    |
| Coach notes / athlete logs | Private notes; athlete training logs with "visible to coach" flag.                                                                                                      | Coach/athlete        | ✅     | W, M (logs) | Minor                       |

## C. Memberships & payments

| Feature                                                | What it does                                                                                                                              | Status                             | Platform  | Notes                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------- | -------------------------------------- |
| Membership plans & prices                              | Gym-defined named plans of 3 billing types (monthly, competition team, pay per class) with optional prices; retire not delete.            | ✅                                 | W         | Prices are guidance only               |
| Payment tracking                                       | 6-month grid (cards on phones); paid / unpaid / waived per month; overdue computed at query time; payments tracked from onboarding month. | ✅                                 | W         | Core                                   |
| Bulk "mark paid"                                       | Records the plan price (with sibling discount) for rows without an amount.                                                                | ✅                                 | W         |                                        |
| Sibling discount                                       | % off 2nd+ children sharing a parent account.                                                                                             | ✅                                 | W         |                                        |
| Athlete payment status                                 | Membership card on Home: last 6 months, never shows amounts.                                                                              | ✅                                 | W (not M) |                                        |
| Online payment links (L1)                              | Per-plan Stripe Payment Link → "Pay November online" button; coach still marks paid.                                                      | ✅                                 | W         | Gym's own Stripe; MatOS holds no money |
| Automatic payment recording (L2 webhook)               | —                                                                                                                                         | 📐 (`matos_payment_links_plan.md`) | —         |                                        |
| Recurring billing / direct debit / invoices / receipts | —                                                                                                                                         | ⛔                                 | —         | Biggest gap vs competitors             |
| Tax / VAT handling                                     | —                                                                                                                                         | ⛔                                 | —         |                                        |
| Payment reminders                                      | Prefilled WhatsApp/SMS/email message opened from the coach's own device.                                                                  | ✅                                 | W         | Not automated                          |

## D. Classes & scheduling

| Feature                                  | What it does                                                                                                                                                   | Status                                       | Platform                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------- |
| Weekly timetable (template model)        | Recurring classes: name, type (gi / no-gi / comp / open mat), programme (all levels, fundamentals, advanced, kids, teens, women's), coach, duration, capacity. | ✅                                           | W                               |
| Cancel / move one session                | Per-date exceptions with member-visible note.                                                                                                                  | ✅                                           | W                               |
| Capacity enforcement                     | Database-enforced for member/parent/kiosk check-ins; coach can override; "N of M places taken".                                                                | ✅                                           | W                               |
| Athlete week timetable                   | Next 7 days incl. changes, programme filter.                                                                                                                   | ✅                                           | W (M shows plain upcoming list) |
| Class booking / reservations / waitlists | —                                                                                                                                                              | ⛔ (deferred; out of scope)                  | —                               |
| Per-session instances                    | —                                                                                                                                                              | ⛔ (explicitly out of scope; template model) | —                               |

## E. Attendance & check-in

| Feature                       | What it does                                                                                | Status | Platform           |
| ----------------------------- | ------------------------------------------------------------------------------------------- | ------ | ------------------ |
| Self check-in                 | Window 30 min before start → end of class, gym timezone; offline queue on mobile.           | ✅     | W, M               |
| Coach marking                 | Mark present / remove for any date ≤1 year back; live updates (Supabase realtime).          | ✅     | W                  |
| Front-desk kiosk              | Owner-registered tablet; tap your name; no PIN; revocable.                                  | ✅     | W (tablet browser) |
| Parent check-in               | Parent checks a child in.                                                                   | ✅     | W                  |
| Drop-in visitors              | Visitor record with mat fee, paid flag, waiver; 12-month retention; counts toward capacity. | ✅     | W                  |
| QR / card / geofence check-in | —                                                                                           | ⛔     | —                  |
| Attendance analytics          | Reports: check-ins per week, busiest classes, visits per athlete. Streak on athlete Home.   | ✅     | W (streak also M)  |

## F. Belts & progression

| Feature                         | What it does                                                                                                                                                         | Status                      | Platform |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------- |
| Belt + stripe model             | Adult and kids belts (grey/yellow/orange/green families incl. white/black bar variants), 0–4 stripes, `<BeltDisplay />`.                                             | 🟡 colours broken (see top) | W, M     |
| Starting rank on import         | Recorded as initial, not a fake promotion.                                                                                                                           | ✅                          | W        |
| Promote with celebration        | Belt history row + push (mobile) + animation.                                                                                                                        | ✅                          | W        |
| Promotion readiness             | Gym rule (classes and/or months per stripe); Ready / Close / Everyone list; dashboard banner; profile card. Stripes only — belt changes are always the coach's call. | ✅                          | W        |
| Grading day                     | Promote up to 50 members in one go with one note.                                                                                                                    | ✅                          | W        |
| Belt history                    | Per member, visible to athlete and parent.                                                                                                                           | ✅                          | W, M     |
| Curriculum / technique syllabus | —                                                                                                                                                                    | ⛔ (deferred)               | —        |
| Lineage / certificates          | —                                                                                                                                                                    | ⛔                          | —        |

## G. Communication

| Feature                                        | What it does                                                                                                               | Status                                        | Platform  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------- |
| Announcements                                  | Title/body, shown on athlete Home and dashboard until a date.                                                              | ✅                                            | W (not M) |
| One-tap messaging                              | WhatsApp / SMS / email / copy with editable templates (missed you, payment reminder, general); Irish number normalisation. | ✅                                            | W         |
| Invites                                        | Per-person link/QR, bulk QR sheet (printable), self-serve sign-up links.                                                   | ✅                                            | W         |
| Transactional email (invites, new-trial alert) | Resend integration.                                                                                                        | 🔒 (needs a verified domain)                  | —         |
| Push notifications                             | Belt promotion, breakdown shared (Expo push).                                                                              | 🟡 code done; needs EAS project + store build | M         |
| In-app notification centre                     | `notifications` table exists, nothing renders it.                                                                          | 📐                                            | —         |
| Automated campaigns / SMS gateway              | —                                                                                                                          | ⛔                                            | —         |

## H. Reporting & analytics

| Feature                                                 | Status | Notes                                                                                                                                                   |
| ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reports page                                            | ✅     | Attendance trends (12 wks), busiest classes, visits/athlete, joined/left/came back per month, payments recorded (EUR), trial funnel; chart + table view |
| Revenue forecasting, churn prediction, cohort retention | ⛔     |                                                                                                                                                         |
| Export of reports                                       | ⛔     | (GDPR personal-data export exists, see I)                                                                                                               |

## I. Growth, compliance & platform

| Feature                    | What it does                                                                                                                                                                                       | Status                      | Platform        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | --------------- |
| Free trial requests        | Public per-gym link → request form (parent/child aware) → Trials pipeline → "Add as member". Abuse limits.                                                                                         | ✅                          | W (public page) |
| Self sign-up links         | One-time link: person fills own details, becomes athlete.                                                                                                                                          | ✅                          | W               |
| GDPR                       | Consent at sign-up; data export; deletion request → coach-executed anonymisation; self-serve deletion for solo accounts.                                                                           | ✅                          | W, M            |
| Natural-language assistant | Coach chat (Claude Haiku 4.5): 13 read tools, 7 write tools behind a confirmation card; typed confirmation for deactivation; 50 queries/day/gym; every action audited.                             | ✅ (re-verified 2026-11-05) | W only          |
| PWA                        | Installable web app (`next-pwa`, manifest).                                                                                                                                                        | ✅                          | W               |
| Dark mode                  | Colour tokens for `.dark` exist in `apps/web/src/app/globals.css`, but no theme provider or toggle is mounted (`next-themes` is only used by the toast component), so the web app is always light. | 📐                          | W               |

## J. Match analysis module (athlete & coach)

| Feature                        | What it does                                                                                                                          | Status                               | Platform                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------- |
| Breakdowns                     | A named, dated match record for one focus athlete (member or "external person").                                                      | ✅                                   | W, M                                    |
| Tagging player                 | Local video only (never uploaded): positions as intervals with roles, events with modifiers/outcomes, timeline, undo, speeds 0.25–2×. | ✅                                   | W, M (native fullscreen, offline draft) |
| In-app recording               | Record a roll then tag.                                                                                                               | ✅ (not on a real device)            | M                                       |
| Computed profiles & comparison | Gi/no-gi separate, every metric shows n, trajectory by match date; side-by-side compare.                                              | ✅                                   | W, M                                    |
| Share links & share cards      | Public read-only page (token, revocable, opponent name redaction); 1080×1920 image on mobile.                                         | ✅                                   | W, M                                    |
| AI tagging / video processing  | —                                                                                                                                     | ⛔ (phase 2, deliberately not built) | —                                       |

## K. Solo athlete platform

| Feature                           | What it does                                                                                                        | Status | Platform |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Solo sign-up / personal workspace | Anyone can sign up without a gym; analysis works fully; teaser "your gym isn't on MatOS".                           | ✅     | W, M     |
| Attach to a gym later             | Coach invites an existing account; password proves ownership; personal workspace kept.                              | ✅     | W, M     |
| Entitlements / paid tiers         | Table designed (`entitlements`: solo/gym plans, Apple/Google IAP/Stripe sources); never read or written by the app. | 📐     | —        |

---

## Coverage of the brief's checklist

Every area the brief lists is covered above. Items it names that **do not exist**: multiple locations, recurring billing, invoices/receipts, tax configuration, QR check-in, booking/waitlists, curriculum, in-app notification centre, automated email/SMS, financial forecasting, translations.
