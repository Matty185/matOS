-- Stage 2: audit_log.initiated_by only had coach_manual|agent, but the
-- invite-claim flow is a genuine third category — a member acting on their
-- own account, initiated by neither a coach's manual action nor the AI
-- agent. Named generically (not "claim") since GDPR deletion requests,
-- athlete log entries, and other athlete self-service actions in later
-- stages will need the same category. Purely additive — existing rows and
-- the column's default ('coach_manual') are unaffected.

alter type public.initiated_by add value 'self_service';
