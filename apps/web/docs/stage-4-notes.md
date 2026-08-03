# Stage 4 Session Notes

**Date:** 2026-07-18
**Scope:** Members module (list, profile, tabs, add/edit, promotion + celebration), per
`matos_project_plan.md` §10 row 4. First stage to get the full "all reviewers" gate (CLAUDE.md:
security-reviewer + code-reviewer-as-critic + UX review for every module, Stages 4-8).

---

## What was done

- **`BeltDisplay`** (`src/components/shared/belt-display.tsx`) — the one place belt colour/stripes
  ever render, per CLAUDE.md. Exports `ALL_BELTS`/`BELT_LABELS` as the single source of truth for the
  full 17-value enum, reused by the member list's belt filter and the promote-belt dialog so neither
  hand-maintains its own copy.
- **Member list** (`/members`) — search, filter by belt/plan/payment-status/active, bulk mark-paid,
  row → profile.
- **Member profile** (`/members/[id]`) — header (initials avatar, BeltDisplay, plan, status) + six
  tabs (Overview/Attendance/Payments/Belt History/Analysis/Logs), actions (edit, resend invite,
  deactivate, promote belt).
- **Add/edit member** (`/members/new`, `/members/[id]/edit`) — shared `MemberForm`; add auto-sends
  an invite via the same `createAndSendInvite` helper Stage 2's `/api/invite` route uses (extracted
  this stage so both call sites share one implementation).
- **Belt promotion** (`PromoteBeltDialog`) — select belt/stripes/notes → confirm → updates
  `members` + inserts `belt_history` + audit log + a simple celebration (icon + BeltDisplay,
  `tailwindcss-animate`, no new dependency).
- **API routes**: `POST /api/members`, `PATCH /api/members/[id]`, `POST .../promote`,
  `POST .../deactivate`, `POST /api/payments/mark-paid`.
- **Toasts** (`sonner`) wired in project-wide for the first time — CLAUDE.md's UI Standards call for
  them, and this is the first stage with enough real mutations to need them.

## Decisions beyond the plan's literal text

1. **Profile header shows initials, not a photo**, despite plan §7's literal "header (photo,
   BeltDisplay, plan, status)" and §1's "Member profiles (contact, **photo**, belt, join date,
   notes)." Deliberately not building this now: no Supabase Storage bucket/RLS exists yet for photos
   (CLAUDE.md scopes Storage to "photos/documents ONLY," but Stage 1 never created a bucket, since
   nothing needed one until now), and no stage in §10's build sequence names photo upload as a line
   item. Building it properly means new infrastructure (bucket + storage RLS policies + an upload
   control), not a wiring fix like everything else flagged this stage — treated as a real, named gap
   rather than silently substituted. Revisit alongside whichever stage first needs Storage for real
   (video-analysis stubs, Stage 8, don't store video but might reuse the same bucket-setup work).
2. **Bulk mark-paid and the payment-status column are minimal**, not the full plan §7 Payments
   module ("gym-wide grid, members × months, colour-coded" — that's explicitly Stage 6). Built just
   enough to satisfy the Member List's own spec line ("payment status, ... bulk mark-paid"), scoped
   to the current calendar month only.
3. **Coach-adding-a-coach is out of scope.** The add-member form only ever creates `role: 'athlete'`
   rows — "coach management" is plan §7's separate owner-only Gym Settings flow, not part of this
   module, and isn't named in any Stage 1-12 line item. Matches the Stage 3 settings placeholder,
   which already deferred it.

## ECC review — all reviewers (CLAUDE.md: Stages 4-8 get security + code-reviewer + UX)

Three parallel review passes, all against the full Stage 4 diff, cross-checked against CLAUDE.md and
`matos_project_plan.md` §3/§4/§7/§8. **All three passed with no BLOCKED items** (UX found four
CLAUDE.md-standard violations formally logged as BLOCKED-but-deferrable per the project's own
convention — fixed anyway, see below, rather than actually deferred).

### Found via live end-to-end testing, before the formal review even ran

Real bugs caught by driving the app (Playwright against a live throwaway gym: add → edit → promote
→ bulk-mark-paid → claim → deactivate), not by typecheck/build:

1. **Member list sorts by last name** — a Playwright selector bug in my own verification script
   (`checkboxes.nth(1)` assumed row order), not an app bug, but worth noting since it's exactly the
   kind of assumption that would also trip up a real coach scanning the table expecting insertion
   order.
2. Nothing else — this stage's live-testing pass was clean on the first real bug hunt, unlike Stage 3
   (RSC prop-passing) and Stage 2 (middleware redirect). Structure held up.

### security-reviewer — PASSED, 3 FLAGGED (all fixed)

1. **`.at(-N)!` route-param parsing was fragile** (each of the three `/api/members/[id]/**` routes
   hand-parsed `request.nextUrl.pathname` instead of using Next's own route params) — not exploitable
   today, but a maintainability trap as Stages 5-8 add more nested dynamic routes. **Fixed**:
   `withAuth`'s `Handler` type now threads Next's `{ params }` argument properly; all three routes
   updated to destructure `params.id` instead.
2. **`getCurrentMember()` didn't check `active`** — a deactivated coach/owner's still-valid Auth
   session could load the dashboard shell (every actual read/write was already independently
   blocked by RLS/withAuth, so no data leak, but "deactivated means no access" should hold at the
   shell level too). **Fixed**: added `.eq("active", true)` to the query, matching `withAuth`'s own
   explicit check.
3. **Deactivate route had a non-atomic check-then-write race** (two concurrent clicks could both
   pass the `!member.active` guard and both "succeed," producing two permanent audit_log entries for
   one event). **Fixed**: conditional update (`.eq("active", true)` on the UPDATE itself, checking
   affected-row count) — same fix pattern as Stage 2's invite-attempt-counter race.

### code-reviewer (critic vs. plan) — PASSED, 4 FLAGGED (3 fixed, 1 documented as a scope decision)

1. Member list was missing the plan and payment-status filters plan §7 explicitly lists (only belt +
   active existed). **Fixed** — both added, using data already loaded on the page.
2. Belt filter only covered adult belts, not the kids families plan §3 says share the same list.
   **Fixed** — filter now covers the full enum via the new `ALL_BELTS` export.
3. Attendance tab had no avg-per-week stat, despite plan §7's explicit "(list + avg-per-week
   stats)." **Fixed** — computed client-side from data already fetched (`date-fns`
   `differenceInCalendarWeeks`, floored at 1 week to avoid a misleading spike for brand-new members).
4. Profile header photo — see Decision #1 above; documented rather than built.
5. (Code quality, non-blocking) `PLAN_LABELS` and belt-label maps were duplicated across files.
   **Fixed** — extracted to `src/lib/constants/member-labels.ts` and `belt-display.tsx`'s exports.

### UX review — PASSED, 4 FLAGGED + 4 BLOCKED-but-deferrable (all fixed now, not deferred)

Per CLAUDE.md, UX BLOCKED items are logged for the polish stage rather than halting the build — but
all eight were cheap (padding, a `className`, a color swap, two toast calls), so fixed immediately
rather than carried as debt across four more module stages:

- Table-row selection checkboxes were 16px, well under the 44px minimum — wrapped in a `h-11 w-11`
  flex container.
- Deactivate confirmation dialog's Cancel/Deactivate buttons were the 36px shadcn default — added
  `h-11`.
- Bulk "Mark N paid" gave no toast feedback on success _or_ failure — added both, matching the
  single-member equivalent in the Payments tab.
- The "Paid" badge (`bg-green-600` custom color) measured ~3.3:1 contrast, below WCAG AA's 4.5:1 —
  switched to the same `default` (navy/`primary-foreground`) variant the Payments tab already used
  correctly, fixing contrast and an inconsistency in one move.
- `Tabs`/`TabsTrigger`'s shared component defaults (36-40px) were under 44px — fixed at the
  **shared-component level** (`src/components/ui/tabs.tsx`), not just this page, since Tabs will be
  reused in later stages.
- Payments column showed a false red "Unpaid" while the payment-status query was still loading —
  added an explicit loading state (`—`) and error state.
- Only 3 of 7 `MemberForm` fields had inline validation errors wired up — added the remaining four
  (phone, both emergency-contact fields, notes).
- Resend-invite button had dead code (`inviteExpired ? "X" : "X"`, both branches identical) — now
  actually distinguishes "Send invite" (never sent) / "Resend invite (expired)" / "Resend invite."

## Verification performed

Full Playwright-driven, live-database end-to-end testing, run twice: once before the review gate
(confirmed the module works as built) and once after all review-driven fixes (confirmed nothing
regressed, and specifically re-checked the touch-target fixes measure the real pixel values the
review demanded — e.g. the tab-trigger fix initially landed at 40px on the first attempt, caught by
re-measuring rather than assuming the CSS change worked, then corrected to a true 44px). Covered:
add member (+ real Resend email send — `RESEND_API_KEY` now valid, confirmed `201` not the old
`502`), list display, edit, promote belt (+ celebration, + `belt_history` attribution), bulk
mark-paid, full claim flow reusing Stage 2's invite mechanics, deactivate, and every UX fix
specifically (filter controls present, checkbox/dialog/tab touch targets, toast visibility).

## Not done (out of Stage 4 scope)

- Photo upload (Storage bucket infra) — see Decision #1.
- Full payments grid, overdue alerts — Stage 6.
- Attendance marking/realtime (the Attendance tab correctly shows a real, currently-empty query) —
  Stage 5.
- Video analysis (Analysis tab, real, currently-empty) — Stage 8.
- Coach/owner management ("Gym settings") — not scheduled as its own build-sequence line item;
  remains a Stage 3 placeholder.
