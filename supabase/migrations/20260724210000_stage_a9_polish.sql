-- Match Analysis Module — Stage A9 (full ECC pass) fixes. Both items below
-- are documentation/grant-hygiene only — no behavior change, confirmed by
-- both reviewing agents to be non-exploitable today (RLS already blocks
-- everything these close off a second, redundant way).

-- security-reviewer: every other purpose-built SECURITY INVOKER RPC in this
-- codebase (increment_agent_query_count, increment_invite_attempt) applies
-- an explicit REVOKE/GRANT pair as defense-in-depth even though, like
-- tag_position, RLS scoping to authenticated-only policies already makes it
-- functionally redundant — tag_position (added 20260724120000) was the one
-- exception, not by design, just missed. Closing the inconsistency.
revoke execute on function public.tag_position(uuid, uuid, text, numeric) from public, anon;
grant execute on function public.tag_position(uuid, uuid, text, numeric) to authenticated;

-- database-reviewer: the A1 review-fix migration documented the
-- alphabetical-by-name trigger-firing-order caveat on breakdown_events'
-- pair of BEFORE triggers, but never added the equivalent comment on
-- breakdown_positions' analogous pair (breakdown_positions_derive_gym_id /
-- breakdown_positions_validate) — same "silent trap for a future editor"
-- class the original comment exists to warn about. No live bug today
-- (validate_breakdown_position never reads gym_id), purely documentation.
comment on trigger breakdown_positions_derive_gym_id on public.breakdown_positions is
  'BEFORE trigger, fires alongside breakdown_positions_validate. No ordering dependency between the two exists today (validate reads only position_id/role, never gym_id) — Postgres only guarantees alphabetical-by-name ordering among same-timing triggers, so re-verify this if either function is ever changed to read a column the other one sets.';

comment on trigger breakdown_positions_validate on public.breakdown_positions is
  'BEFORE trigger, fires alongside breakdown_positions_derive_gym_id. See that trigger''s comment for the ordering-independence note.';
