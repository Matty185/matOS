# Stage 8 Session Notes

**Date:** 2026-07-19 to 2026-07-21
**Scope:** Athlete portal — Home (streak, upcoming classes), My Progress (attendance/belt history/logs
tabs), Upload (video stub), Account (contact edit, password, GDPR export/deletion request), and the
coach-side GDPR execution flow in Gym Settings, per `matos_project_plan.md` §7/§10 row 8 and the GDPR
deletion flow paragraph.

---

## What was done

- **Home** (`src/app/(athlete)/home/page.tsx`) — welcome + `<BeltDisplay>`, an attendance-streak card
  (consecutive Mon-Sun weeks with a check-in, current week doesn't break the streak if not over yet),
  upcoming classes for the next 7 days.
- **My Progress** (`src/app/(athlete)/progress/page.tsx` + `src/components/shared/progress-client.tsx`)
  — one page with three tabs (Attendance history + avg/week, Belt History timeline, Logs), matching
  the plan's "My Attendance / My Progress" as a single nav item (confirmed unchanged in `app-shell.tsx`
  since Stage 3 — not a new interpretation invented this stage). Logs get full CRUD, including real
  hard delete on the athlete's own entries (`athlete_logs_all_self` has granted this since Stage 1).
- **Upload** (`src/app/(athlete)/upload/page.tsx`, `src/app/api/video/upload/route.ts`) — file picker
  → validated multipart upload (type/size, 500MB cap) → pending `analyses` row → simulated processing
  delay → complete with a mock report. No video bytes are ever persisted (no Storage call exists).
- **Account** (`src/app/(athlete)/account/page.tsx`) — contact edit (phone/emergency contact only,
  matching the Stage 1 trigger's allowed scope), password change (direct `supabase.auth.updateUser`),
  data export (`GET /api/account/export`, downloads a JSON file), and account deletion request with a
  persistent pending-state display.
- **GDPR execution** (`src/app/api/deletion-requests/[id]/execute/route.ts`, owner-only, wired into
  `src/components/shared/gdpr-section.tsx` on the Gym Settings page) — anonymises the member row, hard
  -deletes attendance/logs/analyses, anonymises payment/belt-history notes, nulls the audit actor for
  rows the member authored, deletes the auth.users account.
- **`src/lib/validation/account.ts`** — `accountEditSchema`, `athleteLogSchema`.
- **`src/app/api/logs/`** — CRUD routes for `athlete_logs`, self-only.

## Decisions beyond the plan's literal text

1. **Anonymized email is a synthetic placeholder (`deleted-{member.id}@anonymized.invalid`), not
   null/empty.** `members.email` is `NOT NULL` with `UNIQUE(gym_id, email)` — a null or a fixed
   placeholder string would either violate the constraint outright or collide on a second deletion in
   the same gym. Keying the placeholder on the member's own UUID satisfies "email cleared" in spirit
   (no real address recoverable) while staying schema-valid and collision-free.
2. **My Attendance/My Progress folds into one page with tabs**, not two separate nav items — this was
   already the established design (one "My Progress" entry in `ATHLETE_NAV` since Stage 3), not a
   deviation introduced here.
3. **Video "polling"** is a single synchronous request with a server-side simulated delay, not literal
   client-polling against an asynchronously-completing row — same reasoning as documented in the route
   itself: no background-job infrastructure exists in this stack (out of scope per CLAUDE.md), and a
   client-orchestrated two-request dance would leave a row stuck at `pending` forever if the athlete
   closed the tab mid-flow.
4. **GDPR data export uses service-role for the `analyses` query specifically** (added during review,
   see below) — every other exported table's RLS "select own" policy has no further restriction, but
   `analyses_select_self` additionally requires `visible_to_athlete = true`, which is a screen-scoping
   condition correct for the app UI but wrong for an export whose entire purpose is "everything held
   about you," including a coach-hidden analysis.

## Found via live end-to-end testing, before the formal review ran

- **`POST /api/video/upload` returned a 500 on the very first upload.** Stage 1 gave `analyses` only
  staff-scoped INSERT/UPDATE policies — it didn't yet know the plan's Upload feature is athlete-
  initiated (self-upload, self-flip-to-complete), since that didn't exist until this stage. **Fixed**:
  `20260721120000_athlete_self_service_analyses.sql` adds `analyses_insert_self`/`analyses_update_self`,
  the same "full CRUD on own rows" treatment `athlete_logs` already had.
- **The 3/gym/day upload limit could be bypassed by concurrent requests.** The original check-then-
  insert (`SELECT count(*)` then a separate `.insert()`) raced under concurrent uploads — caught when
  a Playwright test's premature toast match accidentally fired three uploads near-simultaneously and
  all three passed the same stale count. Same bug class already fixed twice in this project (invite
  `attempt_count`, agent `rate_limit.query_count`). **Fixed once, then fixed again more thoroughly**
  during the review gate — see below.
- **Two test-fixture bugs, not app bugs**, both the same root cause already hit (and fixed) in Stage
  6/7 verification scripts: `checked_in_date` is always server-derived from `checked_in_at` via a
  Stage 1 trigger (never the client-supplied value), and a fixture timestamp built at local midnight-
  ish time (this machine: Europe/Dublin, UTC+1) rolled back a UTC calendar day, landing two intended-
  separate-week attendance rows in the same ISO week and producing a streak of 1 instead of 2. Fixed
  by anchoring fixture timestamps to local noon.
- **Playwright/test-only issues**, not app bugs: `getByLabel("Phone")` substring-matched "Emergency
  contact phone" too (needed `{ exact: true }`); asserting on the GDPR export's JSON via
  `response.json()` failed because clicking a `Content-Disposition: attachment` link correctly
  triggers a real browser download, which hands the response body to the download manager rather than
  leaving it readable via the network API — fixed by using Playwright's `download` event instead.

## ECC review — all reviewers (CLAUDE.md: Stages 4-8 get security + code-reviewer + UX)

**First time in this project both security and code-reviewer independently produced a genuine BLOCKED
finding in the same gate** — both on the GDPR execution path, the highest-stakes surface built so far.
Per CLAUDE.md ("Never proceed past a BLOCKED item from security or critic"), both were fixed and
re-verified live before this stage was considered done.

### security-reviewer — 1 BLOCKED, 4 FLAGGED (all fixed)

- **[BLOCKED] The execute route discarded almost every mutation's result and unconditionally returned
  success.** Only the member-anonymize `UPDATE` checked its error; the five-way `Promise.all`
  (attendance/logs/analyses delete, payments/belt_history notes update), the audit-actor-nulling
  update, `auth.admin.deleteUser`, and the `deletion_requests.executed_at` update were all fire-and-
  forget. A partial failure — including the auth account surviving — would still show "Member data
  deleted," write a success audit row, and mark the request executed. **Fixed**: every step now checks
  its own error and aborts (500, nothing marked executed) before proceeding; every operation involved
  is naturally idempotent, so a retry after a failure is always safe.
- **[FLAGGED, fixed] `analyses_insert_self`/`analyses_update_self` had no rate-limit or column scope
  at the RLS layer** — the daily cap only existed inside a convenience RPC the app chose to call, and
  `analyses_update_self` permitted changing _any_ column (including `created_by`, enabling authorship
  spoofing) on an athlete's own row. **Fixed**: superseded the RPC with a `BEFORE INSERT` trigger
  (`enforce_analysis_daily_limit`) so the cap applies regardless of insert path, plus a
  `BEFORE UPDATE` trigger (`enforce_analysis_self_update_scope`) restricting athlete self-updates to
  `status`/`analysed_at`/`report`, mirroring the existing `enforce_member_self_update_scope` pattern.
- **[FLAGGED, fixed] GDPR export silently omitted `visible_to_athlete = false` analyses.** See
  Decision 4 above.
- **[FLAGGED, fixed] `photo_url` wasn't cleared during anonymisation** — no photo-upload feature exists
  yet, so not exploitable today, but the column is explicitly athlete-self-editable per the Stage 1
  trigger and would have silently regressed GDPR erasure once photo upload ships. Added to the
  anonymize update now.
- **[FLAGGED, not fixed]** No pre-parse `Content-Length` check on video upload before `formData()`
  buffers the body — noted as likely bounded by the hosting platform's own request-size limit in
  practice; not fixed given this stage doesn't touch real video storage/streaming infrastructure.

### code-reviewer (critic vs. plan) — 1 HIGH/blocked, otherwise PASSED (fixed)

- **[BLOCKED] `deletion_requests_update_staff` (Stage 1) let _any_ coach — not just the owner — update
  a deletion_requests row directly via the RLS client, including `executed_at`.** The app's
  `requiredRole: "gym_owner"` gate on the execute route was never backed by a matching DB-layer
  restriction (CLAUDE.md Rule 2: "RLS... is the security boundary. Application-layer checks are UX
  convenience only."). A non-owner coach could set `executed_at` directly from the browser console,
  making the request vanish from the pending queue and telling the athlete their data was erased,
  while nothing was actually anonymised or deleted. **Fixed**: `deletion_requests_update_staff`
  replaced with `deletion_requests_update_owner`, gated on `private.is_owner()` instead of
  `is_coach_or_owner()`. Live-verified afterward: a real coach session's direct RLS update now affects
  zero rows.
- Everything else — plan-completeness (Home/Progress/Upload/Account screens, the GDPR flow's exact
  wording clause-by-clause), streak/upcoming-classes logic, the new migrations' locking correctness,
  `initiated_by` consistency, code cleanliness — passed with no other findings.

### UX review — PASSED, 6 FLAGGED (5 fixed, 1 accepted/low-impact)

- Optional fields (`emergency_contact_name`/`phone`, `working_on`/`struggling_with`/`notes`) had
  `register()` wired but no inline error rendering — exceeding the length cap made Save a completely
  silent no-op (worse than "not inline": invisible). **Fixed** — inline errors added, matching the
  pattern already used elsewhere on the same forms.
- "Request account deletion" and "Delete log entry" lacked the pending/disabled state their sibling
  destructive actions (GDPR execute, Stage 4 deactivate) already have. **Fixed** on both.
- A blank flash (neither button nor status text) while the pending-deletion-request check was still
  loading. **Fixed** — added a "Loading..." line for that state.
- Neither GDPR confirmation dialog (athlete request, owner execute) mentioned that the member's login
  is permanently deleted, only that data is anonymised/deleted. **Fixed** — both dialogs now say so
  explicitly.
- The post-request pending-deletion state read as a plain muted text line, under-weighted for the
  app's most significant self-service action. **Fixed** — wrapped in a bordered/tinted callout,
  consistent with the destructive-tinted treatment used elsewhere.
- Upload's status badge didn't visually distinguish `pending` from `failed`. **Fixed** — `failed` now
  renders as a destructive badge.
- Not fixed: proactive rate-limit-style banner fetch-on-mount wasn't applicable here; the one accepted
  item was the recurring `--destructive` global contrast token (already flagged and deferred in
  Stages 5-7), which shows up again on the two destructive buttons in this stage — not this stage's
  fix to make.

## Verification performed

Two full Playwright passes against the real Supabase project. First pass covered the entire portal
end-to-end: streak computation (direct DB assertion of exactly 2 consecutive weeks), upcoming classes,
Attendance/Belt-History/Logs tabs including full log CRUD with a direct DB check that delete actually
removed the row, the upload stub's pending→complete→mock-report flow with a direct DB check, the
3/gym/day limit (initially caught the race described above), contact edit persistence, the data export
download (via Playwright's `download` event, not response-body reading), and the complete GDPR
request→visible-in-Gym-Settings→execute→anonymize chain with direct DB assertions on every claimed
effect (member scrubbed, auth user gone, payment retained with notes cleared, audit actor nulled,
request marked executed). A second pass specifically re-verified every review-driven fix: the export
now includes a coach-hidden analysis, a real non-owner coach session's direct RLS update against
`deletion_requests` now affects zero rows, the full execution flow still completes correctly end-to-end
including the new `photo_url` clear, and the trigger-based daily limit still blocks correctly.
`tsc --noEmit`, `eslint src`, and `next build` all clean after every round of fixes.

## Not done (out of Stage 8 scope)

- Gym details/logo/coach management on the Gym Settings page — plan §10 row 8's own wording scopes
  this stage to "GDPR settings" specifically; the rest of that page remains a later-stage placeholder.
- Photo upload — no Storage bucket/UI exists yet (same deferred decision as Stage 4); `photo_url` is
  still scrubbed defensively during GDPR anonymisation in case it's ever populated by another path.
- Pre-parse request-size guarding on video upload ahead of the hosting platform's own limits.
