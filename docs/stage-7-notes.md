# Stage 7 Session Notes

**Date:** 2026-07-20
**Scope:** Agentic interface — floating button, chat panel, 9 read tools + 6 write tools, coach
confirmation flow, typed confirmation for `deactivate_member`, rate limiting, audit logging, edge
cases (multi-step chaining, disambiguation, out-of-scope redirect), per `matos_project_plan.md`
§6/§10 row 7 and CLAUDE.md's "Agentic Interface Rules" section.

---

## What was done

- **`POST /api/agent`** (new) — coach/owner only. Claude Haiku 4.5, non-streaming, full response.
  Gathers server-side context (gym name, coach name, current date, active member count, overdue
  count — reusing Stage 6's `overdue.ts`) and injects it into the system prompt. Runs a manual
  tool-use loop (not the SDK's Tool Runner — deliberately, since write tools must never
  auto-execute): read tool calls execute inline against the RLS client and feed results back to
  Claude across up to 6 iterations; the moment a write tool is called, the loop stops and the
  proposed call(s) are returned to the client as `type: "confirmation"` rather than executed.
- **`src/lib/agent/tools.ts`** — JSON schemas for all 15 tools named in plan §6, plus
  `WRITE_TOOL_ENDPOINTS`, a map from each write tool to the real REST endpoint/method/body shape it
  corresponds to (all six map 1:1 onto endpoints already built in Stages 4-6 — no new write logic
  was created this stage).
- **`src/lib/agent/read-tools.ts`** — server-side execution of the 9 read tools, scoped entirely by
  RLS (no tool schema accepts a `gym_id`).
- **`src/lib/agent/system-prompt.ts`** — terse/functional tone, untrusted-tool-result-data
  disclaimer, disambiguation guidance, and an explicit instruction to propose write tools directly
  rather than asking a clarifying "should I do this?" first (added mid-stage, see below).
- **`src/components/shared/agent-chat.tsx`** — floating button (React portal, fixed position) +
  Sheet-based chat panel. In-session history only (client state, sent per request, never persisted
  server-side beyond the audit trail). Renders answer/confirmation/error turns; confirmation cards
  list every proposed action with the resolved member name; `deactivate_member` requires typing
  "yes"/"confirm" before Confirm enables. Confirmed actions are executed by the **client**, calling
  the real REST endpoint directly — never routed back through `/api/agent`.
- **Rate limiting** — `agent_rate_limits` (Stage 1 table) via an atomic `increment_agent_query_count`
  RPC (see Decision 2), warning banner at 40, hard block at 50 with a reset-at-midnight message.
- **Audit logging** — every `/api/agent` call writes a generic `agent.query` row with the raw NL
  query; when a write is later confirmed, the six REST endpoints now also accept an optional
  `agent_query` field (threaded through their Zod schemas) that sets `initiated_by: 'agent'` and the
  query text on _that specific mutation's own_ audit row — a two-layer trail: one row per
  conversational turn, plus agent-attributed rows on the actual data changes.
- **`<AgentChat />`** mounted in the coach layout only — no athlete-side access, matching the plan's
  Athlete screens list (no agent entry).

## Decisions beyond the plan's literal text

1. **`tool_call` in the response is an array, not the plan's literal singular sketch.** Plan §6's
   wire contract shows `{type, content, tool_call?}`. "Multi-step chaining... one batched
   confirmation" (e.g. "mark all overdue as paid") requires proposing several writes at once, so
   `tool_call` is `PendingWriteCall[]`. A straightforward reading of the plan's own stated behaviour,
   not a deviation from it.
2. **The rate-limit increment is a `SECURITY INVOKER` RPC**
   (`20260720120000_atomic_agent_rate_limit_increment.sql`), not a plain read-then-upsert — added
   during the review gate (see below) after the security reviewer identified the same check-then-act
   race already fixed once for invite `attempt_count` (Stage 2). Unlike that earlier fix (`SECURITY
DEFINER`, called from the service-role client, pre-auth), this one runs as the calling
   authenticated user precisely so `agent_rate_limits_all_own`'s RLS policy still governs the
   insert/update — matching CLAUDE.md's "the agent uses the RLS client exclusively" for this
   bookkeeping table specifically, not just for reads.
3. **`gym_id` is not accepted in the request body**, even though the plan's wire sketch includes it
   (`{query, conversation_history, gym_id}`). `context.gymId` from `withAuth` is already
   authoritative and strictly more trustworthy than anything client-supplied — omitting it is a
   direct application of CLAUDE.md's "gym_id injected server-side, never taken from model output"
   principle at the request level, not only inside tool calls.
4. **A manual tool-use loop, not the Anthropic SDK's Tool Runner.** The Tool Runner auto-executes
   every tool call it receives; this stage's core requirement is the opposite — write tools must
   _never_ auto-execute, only propose. Modeling that as a "gate inside the tool's run function"
   would work for a single write tool, but doesn't cleanly support "stop the whole turn, batch every
   pending write, hand it to a completely different execution path (the client's REST calls) than
   the one that produced it." A ~40-line manual loop was clearer than fighting the Tool Runner's
   automatic-execution model for this specific shape.

## Found via live end-to-end testing, before the formal review ran

- **`get_member`/`get_members` name search was silently broken for full names.** The initial
  implementation used a DB-side `first_name.ilike.%name%,last_name.ilike.%name%` filter. Asking the
  agent "mark Priya Overdue as paid" correctly resolved to a `get_member({name: "Priya Overdue"})`
  tool call, but the filter could never match — neither column alone contains the full "Priya
  Overdue" string, only "Priya" and "Overdue" separately — so the agent reported "no member found"
  for a member that existed. This is a real application bug, not a test artifact, caught only by
  driving the actual chat flow with a full name (a `tsc`/`lint`/unit-test-style check would never
  have caught the DB-filter semantics). **Fixed**: `matchByName()` now fetches the candidate set and
  filters in memory, splitting the query into whitespace tokens and requiring every token to appear
  somewhere in `"first_name last_name"` — handles full names, single-token partial names, and
  reversed order. Bounded to alpha member-list scale (no DB-side limit before filtering), same
  simplification already accepted elsewhere for this project's current scope.
- **Occasional hesitation before proposing a write**, observed as an intermittent (not
  deterministically reproducible) failure in a long, multi-turn live browser session: the model
  sometimes asked a clarifying question in plain text instead of calling the write tool directly,
  even when the request was unambiguous. Confirmed via 8/8 isolated single- and two-turn direct API
  calls that the _route_ always behaves correctly given the same input — this was model behavior
  variance under a growing conversation, not a code defect. Addressed by strengthening the system
  prompt with an explicit instruction to propose the tool call directly rather than asking permission
  first (the UI's own confirmation step already provides that gate), and by restructuring later test
  sections to start from a fresh in-session history — consistent with the plan's own "in-session
  history only" design, not a workaround.

## ECC review — all reviewers (CLAUDE.md: Stages 4-8 get security + code-reviewer + UX)

Highest-risk stage to date (natural-language input reaching a tool-calling LLM with write access to
gym data) — all three reviews ran with extra scrutiny on the read/write execution split specifically.
**All three passed with zero BLOCKED items.**

### security-reviewer — PASSED, 2 fixed (MEDIUM + LOW), 1 assessed as intentional

Traced the write-tool path end-to-end and confirmed the core architectural guarantee holds: write
`tool_use` blocks are only ever inspected to build the confirmation payload, never passed to any
execution function; the client is the sole caller of the real REST endpoints; every one of those six
endpoints independently retains `withAuth({requiredRole: "coach"})` + full Zod validation regardless
of what the model proposed. Also confirmed: gym_id never trusted from model output, RLS client used
exclusively (including for `agent_rate_limits`), tool-result data passed back only as structured
`tool_result` blocks with an explicit untrusted-data instruction in the system prompt, and (checked
against Stage 1's `enforce_member_self_update_scope` trigger) that athletes can't write to `notes` —
closing the most obvious prompt-injection vector before it could reach a coach's later query.

- **Rate-limit check-then-act race** (MEDIUM) — flagged as the same bug class already fixed once for
  invite `attempt_count`; direct Anthropic-billing exposure since a race lets the 50/day block be
  bypassed. **Fixed** — see Decision 2.
- **`agent_query` unscrubbed in the audit log** (LOW) — the existing `scrub()` only walks
  `beforeState`/`afterState` key/value pairs; a coach accidentally pasting a secret into a chat query
  would be stored verbatim, permanently, in the immutable `audit_log`. **Fixed** — added a coarse
  pattern-based scrub (`scrubAgentQuery` in `src/lib/audit/log.ts`) that redacts the whole message
  when it looks like it contains a token/password/secret, rather than trying to surgically excise a
  substring.
- `deactivate_member`'s typed "yes"/"confirm" gate is client-side UI only, with no server-side
  distinction between an agent-originated deactivation and a normal dashboard one beyond
  `requiredRole: coach` + `confirm: true` (unchanged from Stage 4) — **assessed as intentional, not a
  gap**: the actor is already a trusted, role-checked coach who could call the endpoint directly
  regardless, so the typed-confirmation requirement is a conversational-safety measure against an
  ambiguous "yes" in a chat flow, not an authorization boundary.

### code-reviewer (critic vs. plan) — PASSED, 0 MEDIUM/HIGH, 2 LOW informational only

Verified all 15 tools present with correct read/write split; model string exactly `claude-haiku-4-5`
with no streaming; multi-step chaining and batched confirmation actually work (traced the loop, not
just asserted); disambiguation, typed confirmation, and the exact 40/50 rate-limit thresholds all
match the plan precisely; the two-layer audit design assessed as a reasonable, non-overengineered
interpretation of CLAUDE.md's one-sentence requirement; all six write tools confirmed to map 1:1 onto
real Stage 4-6 endpoints with no duplicated logic. Two LOW notes, explicitly marked as needing no
action: confirmed-write failure toasts show the specific REST error message rather than the plan's
literal fallback sentence in every case (a defensible product choice, not a bug); `get_member`/
`get_members` have no DB-side row cap before in-memory filtering (fine at alpha scale, worth a proper
limit if a gym's roster grows materially — not now).

### UX review — PASSED, 5 FLAGGED (4 fixed, 1 accepted/low-impact)

- Confirmation cards could show "Confirmed." even when part of a batched write failed — the toast
  disappears after a few seconds but the persistent transcript would misrepresent what actually
  happened. **Fixed** — added a `"partial"` status distinct from `"done"`, rendered in destructive
  text pointing back at the error.
- The message input stayed visually enabled (not just non-functional) while a request was in
  flight — no double-submit risk, but a confusing dead interaction. **Fixed** — `disabled={loading}`
  alongside the existing rate-limit-blocked condition.
- The destructive `deactivate_member` proposal was visually identical to a routine confirmation card
  aside from a small inline badge. **Fixed** — the whole card gets a `border-destructive`/tinted
  treatment when any batched action requires typed confirmation.
- No `aria-live` region on the message list — a screen-reader user with focus elsewhere would get no
  notification when a response arrived. **Fixed** — `aria-live="polite"` on the scroll container.
- Rate-limit banners only populate reactively from a response received this session, so a coach
  reopening the panel mid-day after already crossing 40/50 in an earlier session sees no banner until
  their next query. **Not fixed** — explicitly low-impact per the review (not a spec violation, no
  proactive-fetch requirement in CLAUDE.md), noted for awareness only.

## Verification performed

Two full Playwright passes against the real Supabase project and the **real Anthropic API** (Claude
Haiku 4.5, real billed calls — not mocked), plus several small isolated diagnostic calls used to
root-cause the two real issues found (the name-matching bug, and the intermittent-hesitation
behavior). First pass covered: the floating button/panel, a real `get_overdue_payments` read-tool
call correctly identifying a live overdue fixture, the full write-confirmation flow (propose →
confirm → real REST call → DB state → agent-attributed audit row), `deactivate_member`'s typed-
confirmation gating (Confirm button provably disabled until "yes"/"confirm" is typed, provably
enabled after), and the 50-query hard block. A second pass specifically re-verified the review-driven
fixes: the atomic RPC produces exactly `query_count = 50` after 50 real increments with no lost
updates (direct DB assertion, not just HTTP status codes), the 50th query is allowed with the warning
flag while the 51st is hard-blocked, and the write-confirmation flow still works end-to-end after the
rate-limit change (regression check). `tsc --noEmit`, `eslint src`, and `next build` all clean after
every round of fixes.

## Not done (out of Stage 7 scope)

- Extended/adaptive thinking for Haiku 4.5 — not configured, matching the plan's explicit "Haiku
  4.5... full response (no streaming)" spec; this tier doesn't support adaptive thinking regardless.
- A DB-side row limit on `get_member`/`get_members` before name filtering — fine at current alpha
  scale (single gym, tens of members) per the code-reviewer's own note; revisit if the seed script
  (Stage 9) or real gym data grows materially past that.
- Proactive rate-limit-status fetch on panel open — low-impact per the UX review, not required by
  CLAUDE.md.
