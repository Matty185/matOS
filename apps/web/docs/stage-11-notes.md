# Stage 11 Session Notes

**Date:** 2026-07-20
**Scope:** Full ECC review pass; resolve all BLOCKED, per `matos_project_plan.md` §10 row 11 — **BLOCKING**.
Ran security-reviewer, database-reviewer, and code-reviewer against the entire codebase (not diffs — every
migration, every route, every page), plus a live end-to-end Playwright pass covering flows no single prior
stage's own verification exercised together (invite claim → check-in → GDPR request → agent-confirmed
write → GDPR execution → post-deletion login failure, all in one continuous run against a throwaway gym).

---

## Findings and fixes

### BLOCKED (all fixed and re-verified)

1. **GDPR deletion retry bug (code-reviewer).** `deletion-requests/[id]/execute/route.ts` gated
   `auth.admin.deleteUser()` on `member.user_id`, which the members-anonymize step (earlier in the same
   function) nulls. A run that got past anonymizing the member but failed on a later step would, on retry,
   re-fetch `member` fresh, see `user_id` already null, and silently skip ever deleting the real
   `auth.users` row — a "deleted" account's actual login credentials surviving indefinitely while
   `deletion_requests.executed_at` eventually reports success. Fixed by deleting the auth user (and
   anonymizing the audit actor) **first**, while `user_id` is still guaranteed accurate, before nulling it
   on the members row; a retry after the auth user is already gone now re-attempts `deleteUser` on a
   nonexistent id and treats the resulting 404 (`user_not_found`) as success rather than failure.
   Verified the exact error shape via a live throwaway delete-twice test, then verified the full fix via
   the end-to-end GDPR request→execute→post-deletion-login-fails flow.

2. **Audit Log page had no query at all (code-reviewer).** `audit-log/page.tsx` was a static `<EmptyState>`
   with zero data-fetching logic — it would show "No activity recorded yet" regardless of how much real
   activity existed. I'd missed this myself during Stage 10's audit by checking the empty-state _styling_
   without checking there was a query behind it. Built for real: last 200 entries (RLS-scoped
   automatically), filterable by date range / actor / action (client-side over the fetched 200, matching
   the members/payments pages' existing filter pattern), plain-English descriptions via the new shared
   `src/lib/audit/format.ts`.

3. **Dashboard was mostly unimplemented (code-reviewer).** Only "Overdue payments" was real; "Active
   members," "Classes this week," and "Today's check-ins" were hardcoded `"—"`, "Recent activity" was the
   same always-empty stub as the audit log, and "Quick actions" / "flags (overdue, not seen 30+ days)"
   from plan §7 didn't exist in the codebase at all. Built all of it: real counts (active members;
   `classes` rows where `active=true`, since classes are a weekly _template_ per CLAUDE.md Rule 7, not
   per-session instances, so a class row's own count _is_ "this week"'s schedule; today's check-ins via
   `checked_in_date = today`); quick-action links (Add member / Mark attendance / Record payment); flags
   for overdue members and members not seen in 30+ days; a real last-10 recent-activity feed sharing the
   same plain-English formatter as the audit log.

4. **`agent_rate_limits` RLS granted full CRUD instead of SELECT-only (security-reviewer).** The `for all`
   policy let any coach reset or delete their own rate-limit row directly via a browser `fetch()` call
   using the public anon key + their own session — a complete, single-request bypass of the 40/50-per-day
   agent query cap, not merely the concurrent-request race `increment_agent_query_count`
   (`20260720120000`) already closed. Fixed in the new migration: SELECT-only policy, plus the increment
   function moved from `SECURITY INVOKER` to `SECURITY DEFINER` (matching `increment_invite_attempt`'s
   existing pattern) so it can still write despite RLS now blocking every other path — `auth.uid()` stays
   session-derived inside the function body, never a caller argument, so the escalation doesn't reopen a
   path to writing another user's counter. Verified live: direct UPDATE/DELETE from a real coach session
   now affect 0 rows; the real RPC still increments correctly.

5. **Deactivated coaches/owners could self-reactivate (database-reviewer).** `members_select_self` /
   `members_update_self` compared `user_id = auth.uid()` directly instead of routing through
   `private.my_member_id()` the way every other table's `*_self` policy does — so they never inherited
   `20260716130000`'s "add `and active` to every helper function" fix. A deactivated coach's still-valid
   session (not revoked on deactivation, by design — the app layer, not session validity, is what's
   supposed to enforce this) could call `supabase.from('members').update({active:true})` on their own row
   directly and pass RLS, silently undoing their own deactivation at the database layer — the one layer
   CLAUDE.md Rule 2 says must not depend on the (bypassable) application checks. Athlete self-reactivation
   was already correctly blocked by a trigger; this gap was specific to coach/owner rows. Fixed by routing
   both policies through `private.my_member_id()`, which already filters `active` — a deactivated member's
   own row simply stops matching, no new trigger logic needed. Verified live: a deactivated coach's own
   row becomes invisible to their own session and a direct reactivation attempt affects 0 rows; an active
   member's normal self-read/self-update still works unchanged.

### FLAGGED (fixed)

6. **`deactivate_member`'s typed "yes"/"confirm" was never actually sent to (or checked by) the server
   (security-reviewer).** The agent-chat client only gated the Confirm _button_ on the typed input
   matching `/^(yes|confirm)$/i`, then always sent a static `{confirm:true}` regardless — fully
   bypassable by calling the endpoint directly with any typed text or none. Fixed: the client now sends
   the literal `typed_confirmation` string for any action flagged `requiresTypedConfirmation`, and the
   deactivate route independently re-validates it server-side for agent-initiated calls (identified by
   `agent_query` being present — the same signal every other write endpoint already uses to distinguish
   agent vs. direct-UI origin). The direct-dashboard confirm-dialog path is untouched — CLAUDE.md's typed-
   confirmation rule is specific to the agent's `deactivate_member` tool call. Verified live: a scripted
   bypass with no/wrong typed text now gets a 400; the correct flow still succeeds; the dashboard path is
   unaffected.

7. **CSP `script-src` had both `'unsafe-inline'` and `'unsafe-eval'` (security-reviewer + code-reviewer,
   corroborated).** `'unsafe-eval'` is only actually needed by webpack's HMR devtool in `next dev`; a
   production client bundle never calls `eval()`. Dropped it in production (kept in dev), verified against
   a real `next build` + `next start` session with zero console/functionality regressions across every
   page including the interactive agent chat. `'unsafe-inline'` and the open `npm audit` advisories against
   Next 14.2.35 are recorded as an accepted, disclosed risk for alpha rather than fixed now — see the new
   CLAUDE.md Decision Log entry for the full reasoning (both need real, higher-risk changes — a CSP nonce
   threaded through Next's own framework scripts, or a major-version framework upgrade — that don't belong
   squeezed into the days before a demo without room to verify them properly).

8. **Payment `amount`'s documented "two-layer" athlete-hiding didn't exist as code (security-reviewer).**
   RLS (layer 1) correctly scopes an athlete to their own payment row, but nothing actually stripped
   `amount` from it (layer 2) — because no athlete-facing payments screen exists yet to need it. Added
   `toAthleteSafePayment()` to `src/lib/payments/overdue.ts` now, ahead of that screen, specifically so the
   first future PR to add one reaches for it instead of copy-pasting the coach-side grid's plain
   `select("*")`.

9. **Two low-risk database cleanup items (database-reviewer), folded into the same migration:**
   `members_user_id_idx` was a redundant index (`user_id` is already `unique`, which creates the same
   index implicitly) — dropped. The five `private.*()` RLS helper functions relied on schema-`USAGE` denial
   rather than an explicit `revoke execute ... from public` the way every other `SECURITY DEFINER`
   function in this codebase already does — added the explicit revoke for consistency (not currently
   exploitable either way, since `anon` never had schema usage).

### Informational (documented, not code changes)

- **Trigger execution order** for `analyses` currently depends on alphabetical trigger-name ordering
  (`analyses_derive_gym_id` before `analyses_enforce_daily_limit`) rather than an explicit dependency —
  correct today, flagged by database-reviewer as a latent footgun for a future migration with an unlucky
  trigger name. Noted here rather than a schema change, since fixing it structurally (numeric prefixes or
  similar) is a broader convention change better made deliberately, not as a one-off inside this review.
- **`enforce_analysis_daily_limit` has no service-role/seed exemption** — currently safe (`scripts/seed.ts`
  only inserts 2 analyses rows per run, under the 3/gym/day cap, and wipes analyses before reseeding), but
  will start failing outright if seed data ever needs more. Flagged for whoever next touches seed data.

## New migration

`supabase/migrations/20260722120000_stage11_security_hardening.sql` — bundles findings 4, 5, and 9 (all
RLS/grant tightening, no application-code dependency on the old behavior). Applied via `supabase db push`;
types regenerated via `supabase gen types typescript --linked`.

## Verification

- Every fix was verified individually with a targeted live test against a throwaway fixture (real
  `auth.users` accounts + a dedicated gym via the service-role client, driven through the real UI/API with
  Playwright/direct `fetch`), proving both that the specific bypass is closed **and** that legitimate usage
  is unaffected — not just re-reading the code and trusting the reasoning.
- A final, full combined regression ran every fixed flow together in one continuous pass (invite claim →
  check-in → GDPR request → agent read query → agent-confirmed deactivation with real typed-confirmation
  enforcement → dashboard/audit-log rendering real data with correctly-formatted plain-English entries →
  owner GDPR execution → confirmed the deleted account can no longer log in) against a fresh throwaway
  gym: zero findings, zero console errors.
- A clean production build (`npm run build`, after `rm -rf .next`) succeeds, including the two newly-real
  `/dashboard` and `/audit-log` routes.

## Known gaps / deferred

- CSP `'unsafe-inline'` and the Next 14.2.35 npm audit advisories — see CLAUDE.md Decision Log,
  2026-07-20 entry.
- The two informational database findings above.
