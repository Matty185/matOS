-- Match Analysis Module — Stage A7: retire the alpha's original mock
-- "analyses" stub table (prose "technique breakdown" reports, upload flow).
-- Fully superseded now that the real Match Analysis Module (breakdowns/
-- breakdown_positions/breakdown_events, Stage A1 onward) has computed
-- profiles, a real tagging screen, and its own Analysis section — nothing
-- in the app queries `analyses` anymore as of this stage (the mock member-
-- profile "Analysis" tab and the athlete `/upload` page + its API route are
-- all replaced/deleted in this same stage's application code).
--
-- Design notes:
--
-- 1. `drop table public.analyses` implicitly drops the table's own RLS
--    policies, triggers, and indexes — no need to drop those individually.
--    What it does NOT drop are the standalone trigger FUNCTIONS, since two
--    of them (`derive_gym_id_from_member`, `enforce_created_by_self`) are
--    SHARED with other tables (belt_history, payments, athlete_logs,
--    gdpr_consents, invites, deletion_requests) and must be kept —
--    confirmed by grepping every migration for other triggers calling
--    them before deciding what's safe to drop here. Only
--    `enforce_analysis_daily_limit()` and
--    `enforce_analysis_self_update_scope()` are analyses-specific (no
--    other trigger anywhere references either) and are dropped explicitly.
-- 2. `analysis_status` (the enum backing `analyses.status`) is dropped
--    after the table, since the table's column is the only thing using it
--    — confirmed via grep, nothing else references this type.
-- 3. No FK anywhere references `public.analyses` (confirmed via grep for
--    "references public.analyses" across every migration) — a clean drop,
--    no cascade needed, no other table's shape changes as a result.
-- 4. GDPR deletion/export (src/app/api/deletion-requests/[id]/execute,
--    src/app/api/account/export) already stopped referencing `analyses` in
--    this same stage's application code, replaced with the equivalent
--    `breakdowns`-based logic (Non-Negotiable #10) — this migration is
--    safe to apply without breaking either route.

drop table public.analyses;

drop function public.enforce_analysis_daily_limit();
drop function public.enforce_analysis_self_update_scope();

drop type public.analysis_status;
