# Stage 6 Session Notes

**Date:** 2026-07-19
**Scope:** Payments module — gym-wide grid (members × months, colour-coded), per-member/per-period
record/edit/waive, computed overdue, alerts, per `matos_project_plan.md` §10 row 6 ("Payments
module: grid, per-member, computed overdue, alerts") and CLAUDE.md Rule 8.

---

## What was done

- **`src/lib/payments/overdue.ts`** (new, shared) — the single place overdue is computed. Per
  CLAUDE.md Rule 8: `isOverdue(status, period)` returns true only for `status === "unpaid"` where
  `now > endOfMonth(period)` — no grace period, exactly matching "June becomes overdue July 1
  exactly." `trailingMonthWindow(length, monthsBack)` produces the grid's rolling window.
  `getOverdueMemberIds(members, payments, window)` is join-date-aware: a period before a member's
  `join_date` is excluded from their applicable window entirely (never counted as overdue, never
  rendered as unpaid — just not their obligation). Reused by the grid, the dashboard stat card, and
  the per-member Payments tab, so all three agree with each other by construction.
- **`POST /api/payments/record`** (new) — coach/owner-only, upserts a single member's payment for a
  single period to any status (paid/unpaid/waived), with amount/notes. This is the grid's cell
  editor. Distinct from the existing Stage 4 `/api/payments/mark-paid` (bulk, current-month-only,
  used by the Member List's bulk action) — kept both since they serve genuinely different call
  sites, not redundant.
- **Payments page** (`/payments`) — full gym-wide grid replacing the Stage-4 placeholder. Rows =
  active members; columns = a 6-month rolling window (Prev/Earlier navigable, capped so "Later"
  can't go past the current month). Cells are colour-coded badges (Paid=navy, Unpaid=outline,
  Waived=gray, Overdue=red, computed not stored) and are real 44px buttons opening
  `PaymentCellDialog`. A "Show overdue only" toggle and an alert banner surface overdue members
  without leaving the page.
- **`PaymentCellDialog`** (new, shared) — one dialog instance reused across every cell (not mounted
  per-cell) with status/amount/notes fields, inline Zod validation, toast on failure.
- **Dashboard** (`/dashboard`) — the "Overdue payments" stat card now shows a real, server-computed
  count instead of "—". The other three cards intentionally remain unwired placeholders — see
  Decisions below.
- **Member profile Payments tab** (Stage 4, updated) — now shows the computed "Overdue" label
  instead of the raw stored `unpaid` status, using the same shared `isOverdue()` helper as the grid,
  closing a Rule-8 gap the tab had carried since Stage 4 (it displayed raw DB status only).
- **`src/app/error.tsx`** (new) — see Decision 3.

## Decisions beyond the plan's literal text

1. **Overdue/alerts are bounded to a trailing 6-month window**, not a full scan of every member's
   history since `join_date`. The grid's window and the dashboard/alert count both use the same
   `trailingMonthWindow`, so they always agree, but a member who's been unpaid for 8+ months would
   only show as overdue for the 6 most recent applicable periods. Chosen for query boundedness and
   simplicity at alpha scale (one gym, ~18 members) — scanning unbounded history per member is a
   reasonable later optimization, not a correctness requirement the plan actually states.
2. **No athlete-facing payments UI was built.** The plan's Athlete screens list (§7) names Home,
   Check In, My Attendance/Progress, Upload, Settings — no Payments screen. RLS (`payments_select_self`)
   already permits an athlete to read their own payment rows if a future stage adds a screen for it;
   this stage only builds the coach-side grid the plan explicitly asks for.
3. **Added `src/app/error.tsx`**, not named in the plan's Stage 6 line item. CLAUDE.md's UI
   Standards require a "fallback error page for the unhandled" project-wide, but no `error.tsx`
   existed anywhere in the app before this stage — the dashboard's new server-side overdue query is
   the first place in the app that `throw`s on a Supabase error from a Server Component (matching the
   `if (error) throw error` convention every client-side query in this codebase already follows,
   flagged as missing here by the code-reviewer). Rather than leave the first real RSC error path
   with no boundary — which would surface Next.js's raw default error screen — added one root
   boundary. Small, generically useful, not scoped to payments specifically.
4. **`mark-paid` and `record` intentionally coexist.** `mark-paid` (Stage 4) is bulk, current-month,
   always-paid — built for the Member List's "bulk mark N paid" action. `record` (this stage) is
   single-cell, any period, any status — built for the grid. Confirmed via review this isn't
   accidental duplication; unifying them would force the simpler bulk action through the
   single-cell endpoint's richer (and slower, one-row-at-a-time) validation path for no benefit.

## Found via live end-to-end testing, before the formal review ran

- **Test-fixture timezone bug, not an app bug.** The verification script's throwaway `join_date`
  values were built with `new Date(y, m, 1).toISOString().slice(0, 10)` — on a machine ahead of UTC
  (this one: Europe/Dublin, UTC+1), converting local midnight to UTC rolls the date back into the
  _previous_ calendar day, silently shifting a member's join month back by one. This produced a
  false test failure (3 members "overdue" instead of the expected 1) that traced to the fixture, not
  the app — same class of bug the app's own `todayIsoDate()` helpers (Stage 5) already guard
  against, which the throwaway script hadn't applied. Fixed by building the ISO string from
  components instead of `toISOString()`.
- **Test logic gap, not an app bug.** A member with zero payment rows across a 3-period applicable
  window (twoAgo/oneAgo/current) is overdue for _two_ periods, not one — the first version of the
  verification script only cleared one of Bob's two overdue cells and then asserted the alert banner
  was empty, which correctly failed. Fixed the test to clear both and assert the banner's count at
  each step, which incidentally became a better test of the per-period (not per-member) nature of
  the computation.
- No real application bugs were found in this pass — the overdue computation, join-date boundary,
  and cell-recording flow all worked correctly on the first attempt once the fixtures were fixed.

## ECC review — all reviewers (CLAUDE.md: Stages 4-8 get security + code-reviewer + UX)

All three passed with zero BLOCKED items.

### security-reviewer — PASSED, 0 FLAGGED

Specifically verified: no path exposes payment `amount` to an athlete (the dashboard's overdue-count
query selects only `id, join_date` / `member_id, period_month, period_year, status` — never
`amount`; the entire payments module lives under the `(coach)` route group, gated server-side by
`getCurrentMember()`'s role redirect, independent of RLS's own row-scoping); `gym_id` on
`/api/payments/record` is always `context.gymId`, backed by the Stage 1
`derive_gym_id_from_member` trigger rejecting a cross-gym `member_id` regardless of route input;
role enforcement (`requiredRole: "coach"`) confirmed present; the upsert conflict key matches the
DB's unique constraint exactly; input validation covers every field the route writes; audit logging
and error responses leak no internals.

### code-reviewer (critic vs. plan) — PASSED, 2 MEDIUM (both fixed)

Confirmed full plan-completeness (grid, colour-coding, computed overdue matching Rule 8 exactly,
alerts via the banner/toggle/dashboard card, join-date and current-month boundary conditions all
correct), confirmed `mark-paid`/`record` coexistence is justified, confirmed
`noUncheckedIndexedAccess`-safe indexing, confirmed no dead code.

- Dashboard's `getOverdueCount()` destructured Supabase query results without checking `error`,
  silently falling back to an empty array and showing "0 overdue payments" on a real failure —
  inconsistent with every other data-fetch in the codebase (`if (error) throw error`). **Fixed** —
  now throws on either query's error, caught by the new root `error.tsx` (Decision 3).
- The payments-grid query had no `.order()` clause. The cell dialog's reused-instance design relies
  on `existing` staying referentially stable across a background refetch (via TanStack Query's
  structural sharing) so its resync effect doesn't refire mid-edit — but structural sharing compares
  arrays positionally, and Postgres doesn't guarantee row order without an explicit `ORDER BY`, so a
  reordered-but-otherwise-identical refetch (e.g. on window refocus) could have silently reset a
  coach's in-progress, unsaved edits. **Fixed** — added a deterministic
  `.order("member_id").order("period_year").order("period_month")`, plus an `isDirty` guard on the
  resync effect as defense-in-depth (with a companion close-triggered reset so `isDirty` doesn't
  leak from one cell into the next one opened).

### UX review — PASSED, 5 FLAGGED (4 fixed, 1 accepted/out of scope)

- Prev/Next month navigation replaced the _entire_ page (including the nav buttons themselves) with
  a bare "Loading payments..." line on every newly-visited window, since the query had no
  `placeholderData`. **Fixed** — `placeholderData: keepPreviousData` keeps the prior window's grid
  visible while the new one loads.
- The "Show overdue only" checkbox was wrapped in a `<label>` containing another `<Label>`
  (nested labels — invalid HTML, fragile double-toggle risk). **Fixed** — `Checkbox id` +
  `Label htmlFor` pairing inside a plain `<div>`.
- Grid cell buttons had no accessible name beyond the bare status word ("Paid, button" repeated for
  every cell to a screen reader). **Fixed** — `aria-label` now includes member name and period.
  Directly verified via the re-run Playwright test (locates cells by their full accessible name).
- The per-member Payments tab's empty state still read "The full monthly grid lands in a later
  stage" — stale now that the grid shipped this stage. **Fixed** — updated copy.
- The `--destructive` badge/text token measures ~3.6-3.8:1 contrast, under WCAG AA's 4.5:1 for
  normal-size text — flagged as a high-frequency pattern now that Overdue badges can appear dozens
  of times per grid. **Not fixed here** — same pre-existing, global design-system token already
  flagged (and deliberately left) in Stage 5's UX review; a real fix means adjusting the shared
  `--destructive` value app-wide, out of scope for one module.

## Verification performed

Two full Playwright passes against the real Supabase project (throwaway gym/users, cleaned up after
each run): the first covering the grid's colour-coding, the overdue banner/toggle, the join-date
boundary ("—" cells for pre-join months), waived-never-overdue, per-period (not per-member) overdue
clearing, direct DB-state confirmation after a cell edit, the dashboard card, and the profile tab's
computed label — all passed once the test fixtures' own timezone bug was fixed. A second pass
specifically re-verified every review-driven fix: the de-nested checkbox label, the cell buttons'
new accessible names, the dialog still recording correctly after the `isDirty` guard was added, no
loading-flash on month navigation, and — the one genuinely novel risk introduced by the `isDirty`
guard itself — that closing a dialog without saving doesn't leak stale unsaved text into the next
cell opened. `tsc --noEmit`, `eslint src`, and `next build` all clean after fixes.

## Not done (out of Stage 6 scope)

- Athlete-facing payments UI — see Decision 2; not in the plan's Athlete screens list.
- Full-history (unbounded) overdue scanning — see Decision 1; bounded to a rolling 6-month window.
- Wiring the dashboard's other three stat cards ("Active members", "Classes this week", "Today's
  check-ins") — each attributed to its own stage per this file's pre-existing comment; only the
  payments-sourced card was in scope here.
- The `--destructive` contrast token — pre-existing, global, already flagged and deferred in Stage 5.
