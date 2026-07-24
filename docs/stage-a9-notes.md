# Stage A9 Session Notes

**Date:** 2026-07-24
**Scope:** Polish + full ECC review pass; resolve all BLOCKED, per `matos_analysis_module_plan.md` §10
row A9 — **BLOCKING**. The final gate for the Match Analysis Module (Stages A0–A8). Ran
security-reviewer, database-reviewer, and code-reviewer against the entire module — not diffs, every
migration, every route, every page, read together as one composed system, mirroring how Stage 11 ran
the alpha's own final pass. Preceded by a self-driven polish pass (live production build, Playwright at
1280px and 390px across all 8 Analysis-section pages plus the member-profile Analysis tab embed).

---

## Polish pass (self-audit, before the ECC gate)

Zero horizontal-scroll issues and zero new console errors found across every page in the module at both
viewport widths (the only console noise present is the same pre-existing Next.js RSC-prefetch behavior
already identified and dismissed in earlier stages, unrelated to this module). Visual spot-check of the
breakdown list and external-people list confirmed both are demo-ready. No fixes needed from this pass —
the incremental per-stage live-testing discipline already caught what a dedicated Stage 10-style polish
pass exists to find.

## Findings and fixes

### BLOCKED

None from any of the three reviewers.

### FLAGGED (fixed)

1. **`tag_position` RPC had no explicit GRANT/REVOKE pair (security-reviewer).** Every other
   purpose-built `SECURITY INVOKER` RPC in this codebase (`increment_agent_query_count`,
   `increment_invite_attempt`) applies an explicit `revoke ... from public, anon` / `grant ... to
authenticated` as defense-in-depth, even though RLS already makes it functionally redundant —
   `tag_position` (added Stage A3) was the one exception, missed rather than deliberate. Not
   exploitable today (confirmed: an `anon` caller is RLS-denied at every statement inside the function
   regardless), but a genuine inconsistency with an established pattern. Fixed in
   `20260724210000_stage_a9_polish.sql`.

2. **Trigger-ordering documentation asymmetry (database-reviewer).** The Stage A1 review-fix migration
   documented the alphabetical-by-name trigger-firing-order caveat on `breakdown_events`' pair of
   `BEFORE` triggers, but never added the equivalent comment on `breakdown_positions`' analogous pair.
   No live bug (`validate_breakdown_position` never reads `gym_id`), purely a documentation gap of the
   same "silent trap for a future editor" class the original comment exists to warn about. Fixed in the
   same migration.

3. **Trailing open position interval silently excluded from every time-based profile metric
   (database-reviewer).** By design (see `profile.ts`'s own comment — an open interval has no defined
   duration), but nothing ever closed a breakdown's _final_ tagged position, so a match's actual last
   position — often the finishing sequence — would go permanently uncounted the moment the breakdown is
   marked complete and nobody's looking at the video anymore. Fixed: `tagging-screen.tsx`'s
   `toggleStatus()` now closes any open interval at the video's current timestamp when marking a
   breakdown complete, but only when a video is actually loaded that session — guessing a timestamp
   with no video open would just substitute one inaccuracy for another, so the pre-existing "just stays
   open" behavior is the deliberate fallback in that case, not an oversight.

4. **No way to delete a breakdown anywhere — UI or API — despite full DB/RLS support for it
   (independently flagged by both database-reviewer and code-reviewer).** `breakdowns_all_own` is a
   `for all` policy (Stage A1) including DELETE, and `breakdown_positions`/`breakdown_events` have
   `on delete cascade` FKs specifically built for this — Non-Negotiable #8 explicitly frames breakdown
   deletion as "allowed — unlike member records." Nothing ever called any of it: no `DELETE` export on
   `/api/breakdowns/[id]`, no delete action on the breakdown detail page. Asymmetric with
   `external_people`, which got both at Stage A2. Fixed: added `DELETE /api/breakdowns/[id]`
   (author-only via RLS, no `23503`-style guard needed since children cascade rather than restrict) and
   a delete action on the breakdown detail page, gated the same way `canEdit` already is.

5. **Agent tools cannot resolve an external person by name — `get_athlete_profile`/`get_metric`/
   `compare_profiles` were practically unreachable for external-person subjects (code-reviewer).** All
   three take `external_person_id` as their only way to specify an external-person subject, but no
   agent tool ever exposed external people's names alongside their ids — `get_breakdowns` returns raw
   UUIDs with no joined name, and there was no `get_member`-equivalent for external people at all. A
   coach asking "what's Jake Sullivan's takedown defence rate?" (Jake Sullivan is the actual Stage A8
   seeded external person) had no way for the model to discover his UUID. Fixed: added
   `get_external_person`, a name-search tool mirroring `get_member`'s pattern exactly, plus explicit
   system-prompt guidance to try it when `get_member` comes up empty rather than concluding "no member
   found" (the first version of this fix, live-tested, correctly resolved profile/metric queries but
   didn't reliably trigger on a bare "find X" query with no match-analysis framing — judged not worth
   chasing further, since the concretely-flagged gap, match-analysis queries about a named individual,
   is what actually mattered and is now fixed and verified).

6. **`docs/demo-walkthrough.md` was stale — omitted the entire Match Analysis Module and still
   referenced the removed `/upload` mock-analysis flow (code-reviewer).** Step 6 instructed the
   presenter to navigate to `/upload` and show "the mock technique report" — that flow was deleted at
   Stage A7 (commit `1a46612`); following the script live would 404. Separately, the walkthrough never
   mentioned `/analysis`, the profile view, comparison view, or an agent match-analysis query, despite
   Stage A8 seeding data specifically for a credible demo. Fixed: added a new §5 (Match Analysis, 2–3
   min) between Attendance and the agentic interface, added a match-analysis agent-query example to §6,
   replaced §7's `/upload` bullet with the real Analysis nav flow from the athlete's own login, and
   corrected §8's "what's real vs. stubbed" framing (the Match Analysis Module is real and fully built;
   AI-assisted tagging, not manual tagging, is the actually-deferred piece).

### Found via live testing, not by any reviewer

7. **`get_metric`/`compare_profiles` silently defaulted to gi-only when the `gi` parameter was omitted,
   unlike `get_athlete_profile` (which correctly returns both rulesets).** Caught live-testing finding
   5 above: "What's Jake Sullivan's takedown success rate?" returned "no data" because his only
   recorded match is no-gi and the tool silently picked gi. Fixed both tools to return `{gi, noGi}` when
   the parameter is omitted, matching `get_athlete_profile`'s existing behavior; updated both tool
   descriptions from "Defaults to gi" to "Omit to get both rulesets." Re-verified live: the same query
   now correctly answers "100% takedown success in no-gi (n=1). No gi data."

### Informational (documented, not code changes)

- **A GDPR-deleted coach's breakdowns authored about _other_ people survive with `author_id = null`
  (correct, per design) but become permanently un-deletable by anyone thereafter — only `breakdowns_
all_own` (author-scoped) grants DELETE, and there's no author to match anymore (security-reviewer).**
  Not a security issue, consistent with CLAUDE.md Rule 6's general "deletes are mostly disabled"
  posture; staff can still see the row via `breakdowns_select_staff`, just never remove it. Noted here
  rather than built around — would need a new staff-emergency-delete RLS carve-out, explicitly
  low-priority per the reviewer's own framing, out of scope for this pass.
- **Tagging controls aren't disabled once a breakdown's status is `complete` (database-reviewer).**
  Deliberate, per Stage A4's own decision ("status carries no write-permission weight... a milestone
  marker, not a lock") — re-confirmed correct, not a regression, not fixed.

## New migration

`supabase/migrations/20260724210000_stage_a9_polish.sql` — bundles findings 1 and 2 (grant hygiene +
trigger comment, no application-code dependency on the old behavior). Applied via `supabase db push`; no
type regeneration needed (no table/column shape changed).

## Verification

- Full production build (`npm run build`, after `rm -rf .next`) clean throughout every round of fixes.
- Live Playwright verification of every fix individually: `tag_position` still callable post-GRANT/
  REVOKE (regression check, 201 confirmed); auto-close-on-finish confirmed to correctly no-op with no
  video loaded and to correctly close the open interval at the video's current time when one is loaded
  (first attempt showed a false negative traced to the test script's own stale React Query cache after
  an out-of-band API insert, not a product bug — confirmed by reloading the page before re-testing);
  breakdown deletion confirmed end-to-end (delete → redirect to `/analysis` → row confirmed gone from
  the database); `get_external_person` + the gi/no-gi default fix confirmed together via the real
  `/api/agent` endpoint against the actual Stage A8 seeded data, not a mock.
- Re-ran the full agent query sequence from the updated `docs/demo-walkthrough.md` §5–§6 against live
  seeded data to confirm the script itself is accurate, not just internally consistent.

## Known gaps / deferred

- The permanently-un-deletable orphaned-breakdown edge case (informational item above).
- Everything already listed as deferred in prior Match Analysis Module stages (AI tagging, canonical
  match linking, two-athlete tagging, etc. — see CLAUDE.md's "Out of Scope — Match Analysis Module").
