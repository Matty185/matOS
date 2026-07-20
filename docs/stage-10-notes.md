# Stage 10 Session Notes

**Date:** 2026-07-20
**Scope:** Polish — empty/error states, responsiveness audit, PWA manifest, UX review, per
`matos_project_plan.md` §10 row 10. No blocking review gate is listed for this row (that's Stage 11),
but a live UX/responsiveness pass was still run per CLAUDE.md's own review convention.

---

## What was audited (clean, no changes needed)

- **Empty states** — every list view already has a proper `<EmptyState>` (Stage 3's shared component,
  used consistently through Stages 4–8). Views without an `actionLabel` on the empty state (audit log,
  "recent activity", read-only history tabs on a member's profile, "no overdue members") were checked
  individually — in each case there either genuinely isn't a sensible action, or the equivalent action
  is already visible on the page outside the empty-state branch (Classes' "Add class" dialog trigger,
  Upload's "Upload video" button). No gaps found.
- **Loading states** — every `useQuery` call site checks `isLoading`; every mutation handler and every
  react-hook-form `formState` usage has a corresponding `disabled=`/`isSubmitting` guard. No unguarded
  double-submit paths found.
- **Toasts vs. inline validation** — consistent with CLAUDE.md ("toasts for transient errors, inline for
  validation"). The one page with zero `toast.error()` calls (`invite/[token]/page.tsx`) uses inline
  error text by design, matching the login page's own pattern for full-page auth forms.

## What was fixed

1. **`--destructive` contrast (the recurring finding flagged and deferred in Stages 5–7).** shadcn's
   default light-mode `--destructive` (`0 84.2% 60.2%`, i.e. red-500) is ~3.76:1 against white — fails
   WCAG AA's 4.5:1 text minimum, both for `text-destructive` (49 occurrences across 17 files — inline
   validation errors, badges) and for the destructive button's white-on-red fill (same two colors, same
   ratio, same failure). Changed to `0 72.2% 50.6%` (red-600, ~4.83:1 against white). Confirmed live in a
   production-mode browser: computed `text-destructive` color on a real validation error is
   `rgb(220, 38, 38)`, exactly red-600. Dark-mode's `--destructive` was left alone — `next-themes` is a
   dependency but no `ThemeProvider` is mounted anywhere and there's no theme toggle in the UI, so `.dark`
   is genuinely unreachable in this app today (confirmed no requirement for it in CLAUDE.md or the plan);
   fixing an unreachable color for a mode the app doesn't yet support would be scope creep, not polish.
2. **Missing branded 404 page.** `notFound()` is already called from `members/[id]` and
   `members/[id]/edit` for a bad id, and any unmatched route hits the same path — but with no
   `not-found.tsx` anywhere in the app, both fell back to Next.js's generic unstyled 404. Added
   `src/app/not-found.tsx` matching `error.tsx`'s existing card layout. Verified live for both an
   unmatched route and a nonexistent member id.
3. **Two real touch-target gaps found via a live 390px Playwright pass** (`src/app/(coach)/members/page.tsx`):
   - The bulk-select checkbox in each member row sat in a `<div className="h-11 w-11">` — the div
     reserved 44×44 of visual space but, being a plain div, didn't extend the actual click/tap hit area;
     only the inner 16×16 checkbox itself was clickable. Changed the wrapping `<div>` to a `<label>` (no
     visual change — native implicit label→control association means the whole 44×44 area now forwards
     clicks to the checkbox). Verified by clicking the label's corner, 3px in from each edge — well
     outside the visible checkbox glyph — and confirming it still toggles.
   - Member name links in the table were sized to their text only (~37–67px × 37px, under the 44px
     minimum in both axes). Fixed with a `-my-3 block w-full py-3` pattern: padding grows the click box,
     the matching negative margin cancels the visual space it would otherwise add, so the row's layout is
     pixel-identical but the tap target is now ≥44px.
   - Checked every other `Checkbox` usage in the app (payments' "Show overdue only", the "Show inactive"
     filter, `visible_to_coach` and `active` toggles in two form dialogs) — all four already wrap the
     checkbox in a real `<label>` or an explicit `<Label htmlFor>`, which correctly forwards clicks from
     the associated text today; confirmed live for "Show overdue only" by clicking its label text (not
     the checkbox) and watching the state flip. No fix needed there.
4. **PWA service worker was never actually registering — the single most consequential finding this
   stage.** The manifest and icons were already fully wired since Stage 3 (`public/manifest.json`,
   `public/icons/`, linked from `layout.tsx`), and the production build correctly emits `public/sw.js`.
   But `next-pwa`'s `register: true` auto-registration works by injecting a registration script into
   webpack's `main.js` entry — the Pages Router's bundle entry point. This project uses the App Router,
   whose equivalent entry is `main-app.js`; `main.js` is never part of an App Router page's bundle, so
   the injected script was built but never shipped to the browser. Confirmed directly: a real production
   build + `next start`, loaded in a real browser, showed the manifest and `sw.js` both serving correctly
   but `navigator.serviceWorker.getRegistrations()` returned `[]`. Fixed with the standard workaround —
   a small client component (`src/components/providers/service-worker-register.tsx`) that calls
   `navigator.serviceWorker.register("/sw.js")` itself on mount in production, mounted once in the root
   layout. Re-verified: registrations now show `[{ scope: ".../", active: true }]`. This means the app
   was **not actually installable as a PWA** despite every other piece being in place — dev mode disables
   next-pwa entirely (per its own config), so nothing short of an actual production build would have
   surfaced this before a real device install attempt.
5. **`scripts/seed.ts` failed `next build`'s type check outright** — a genuine regression risk, since
   Vercel's build step runs the same `next build` and type-checks the whole project, `scripts/` included.
   This had gone unnoticed because Stage 9's own verification only ever ran the script through `tsx`
   (transpile-only, no type-checking) — the exact gap this stage's "verify via production build" item was
   added to catch. Fixed several `noUncheckedIndexedAccess` violations (regex capture groups, parallel
   array indexing after a batch insert, modulo-indexed lookups — added a small `at()` helper alongside the
   existing `must()`), loosened `AthleteDef.belt`/`promotion.fromBelt` from `string` to the real
   `belt_color` enum type, and added the same "placeholder value the generated Insert type requires but a
   trigger overwrites" pattern already used in `attendance/mark/route.ts` for `checked_in_date`. Re-ran
   the seed script after each fix to confirm runtime behaviour was untouched; `npm run build` now passes
   cleanly.

## Verification

- Full live Playwright pass at 390×844 across every coach and athlete page (dashboard, members, add
  member, payments, attendance, classes, audit log, settings, a member profile, home, check-in, progress,
  upload, account): zero horizontal overflow on any page, zero console errors, both touch-target fixes
  confirmed.
- Not-found page confirmed for both an unmatched route and an explicit `notFound()` call.
- `--destructive` fix confirmed via computed style on a real rendered validation error.
- Full production build (`npm run build`) succeeds cleanly after the `scripts/seed.ts` type fixes.
- Real `next start` production server, real browser: manifest served (200, correct JSON), `sw.js` served
  (200, correct `application/javascript` content-type), service worker registered and active, zero
  console errors.
- Re-ran `scripts/seed.ts` after its type fixes to confirm the runtime output (18 members, correct
  counts) is unchanged from Stage 9.

## Known gaps / deferred

- Dark mode exists as unused CSS variables and an unmounted `next-themes` dependency but has no
  `ThemeProvider`, no toggle, and no requirement anywhere in CLAUDE.md or the project plan — left
  untouched, not a regression, not in scope.
