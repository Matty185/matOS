-- Stage 8 code review (HIGH/blocking): deletion_requests_update_staff (Stage
-- 1) let any coach — not just the gym owner — UPDATE a deletion_requests
-- row, including executed_at/executed_by, via the plain RLS client. That
-- policy was inert in Stage 1 (nothing read/wrote executed_at yet), but this
-- stage's GDPR execute route (POST /api/deletion-requests/[id]/execute)
-- makes it meaningful — and dangerous: a non-owner coach could set
-- executed_at directly from the browser console, which makes the request
-- vanish from the pending queue (gdpr-section.tsx filters on
-- executed_at is null) and tells the athlete their data was erased, while
-- the member row was never anonymised and nothing was actually deleted.
-- The app's own requiredRole: "gym_owner" gate on the execute route was
-- never backed by a matching DB-layer restriction — CLAUDE.md Rule 2: "RLS
-- at the database layer is the security boundary. Application-layer checks
-- are UX convenience only." Tightened to match the app's actual intent.

drop policy if exists deletion_requests_update_staff on public.deletion_requests;

create policy deletion_requests_update_owner on public.deletion_requests
  for update to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_owner()));
