# 03 — User roles and personas

## 1. Roles implemented

Roles live in `members.role` (enum `member_role`: `gym_owner`, `coach`, `athlete`, `guardian`). Permissions are enforced by Postgres RLS (helpers in `supabase/migrations/*`: `private.my_gym_id()`, `is_coach_or_owner()`, `is_owner()`, `my_child_ids()`), and by `withAuth(..., { requiredRole })` on every API route (rank: owner > coach > athlete = guardian).

| Role                                               | Can do                                                                                                                                                                                                                                                                                                   | Cannot do                                                                      | Platform         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------- |
| **Gym owner**                                      | Everything a coach can, plus gym settings (details, timezone, logo), plans & prices, sibling discount, drop-in fee, waiver text, free-trial link, kiosk tablets, promotion rules, staff management (add coach, change roles, (de)activate staff), executing GDPR deletion, issuing reset links for staff | Delete members (deactivate only), edit the audit log                           | Web              |
| **Coach**                                          | Members (add, import, edit, invite, message, photo, holds, waivers on paper/for parents), attendance, promotions & grading day, classes & session changes, announcements, trials, visitors, payments, reports, analysis, audit log, assistant                                                            | Gym settings, plans/prices, staff roles, deactivating staff                    | Web              |
| **Athlete**                                        | Own Home (announcements, waiver prompt, streak, membership status, upcoming classes, Pay online), week timetable, check in, progress (attendance, belt history, own logs), sign waiver, match analysis (own breakdowns + gym-visible ones about them), account/data export/deletion request              | See other members, amounts of payments (in the UI), change own plan/belt/photo | Web + mobile app |
| **Parent / guardian**                              | Family page for linked children: check in, sign waiver for them, see belt/attendance/membership status, Pay online                                                                                                                                                                                       | Train or check themselves in, edit children's records, see other members       | Web              |
| **Solo user** (an owner of a _personal workspace_) | Match analysis for themselves, share links/cards; can later attach to a real gym                                                                                                                                                                                                                         | Gym features (shown as teasers)                                                | Web + mobile app |
| **Kiosk device** (not a person)                    | Shows today's sessions and a first-name/last-initial roster; checks anyone in                                                                                                                                                                                                                            | Anything else; revoked by the owner                                            | Tablet browser   |
| **Operator** (the founder)                         | Provision gyms, reissue owner links, reset owner passwords (`scripts/provision-gym.ts`)                                                                                                                                                                                                                  | —                                                                              | CLI              |

**Not implemented:** a separate "administrator/front-desk" role (CLAUDE.md lists "staff role" as out of scope), a "head coach" distinct from owner (the owner role fills it), franchise/organisation roles above a gym.

## 2. Segments: what's genuinely supported

| Segment                                                      | Supported today?            | Why                                                                                                 |
| ------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------- |
| Small independent BJJ academy (≈20–150 members, 1–3 coaches) | **Yes — the design target** | Everything in the inventory assumes one location, a handful of staff, monthly fees, kids classes    |
| Medium academy (150–400)                                     | Mostly                      | Works, but no automated billing means payment admin scales linearly; assistant limit 50 queries/day |
| Large academy / multi-location                               | **No**                      | No locations, no per-location reports or staff scoping                                              |
| Franchise / association                                      | No                          | No organisation layer, lineage or cross-gym reporting                                               |
| Other grappling arts (judo, wrestling, no-gi-only)           | Partly                      | Belt enum is BJJ-specific (IBJJF-style adult + kids belts); class types gi/no-gi                    |
| Striking martial arts / general fitness                      | No                          | Taxonomy, belts and analysis are BJJ-specific                                                       |
| Individual athletes (no gym)                                 | Yes                         | Solo personal workspace + match analysis (mobile-first)                                             |

## 3. Personas

### Evidence-based (from the build history and the first real customer)

**P1 — "The head coach who owns the gym"** (evidence: Northside BJJ, the first unpaid tester; `matos_onboarding_plan.md`; flow audit priorities)

- Runs an independent Irish academy, coaches most classes himself, has a laptop but does admin between classes.
- Today: WhatsApp groups, a spreadsheet or memory for who's paid, paper for waivers.
- Needs: quick onboarding, knowing who's overdue and who's due a stripe, getting kids' parents sorted, nothing that costs money upfront.
- MatOS answer: setup wizard, payments grid with flags, promotion readiness, parent accounts, free (no billing fees beyond Stripe's).

**P2 — "The athlete who trains 3×/week"** (evidence: athlete web pages, mobile app scope)

- Wants to check in quickly, see the week's classes, see belt progress, know if they owe anything; some want match analysis.

**P3 — "The parent of a kids-class member"** (evidence: flow audit 8.1/8.2, kids programme at the first gym)

- No interest in a full app; needs to check in a child, sign a waiver once, see progress.

### Hypotheses (not yet validated with users)

**H1 — "The competitor / analyst athlete"**: competes regularly, films matches, wants objective stats; possibly the primary audience for the solo mobile app and share cards. Evidence is only the founder's product plan (`matos_mobile_plan.md`), not user research.

**H2 — "The assistant coach"**: teaches some classes, wants attendance and promotions on a phone; currently served by the web app on a phone, not a dedicated mobile coach experience.

**H3 — "The multi-discipline gym owner"** (BJJ + MMA/Muay Thai): would need non-BJJ ranks and class types — not served today.

**H4 — "The academy switching from Gymdesk / Zen Planner / spreadsheets"**: price-sensitive, wants import and no lock-in. Roster import supports this; payment-history import doesn't exist.
