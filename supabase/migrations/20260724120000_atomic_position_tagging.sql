-- Stage A3 review-gate fix: position tagging (close any open interval,
-- then insert the new one) was two sequential client round-trips, not one
-- transaction. security-reviewer flagged the theoretical race; database-
-- reviewer live-reproduced the real failure mode — if the INSERT fails
-- after the UPDATE(close) has already committed (a dropped request, a bad
-- position_id, an RLS rejection), the just-tapped position is silently
-- lost with no compensating rollback: the previously-open interval stays
-- closed, nothing reopens, the "currently tagging" UI state reverts with
-- no explanation beyond a generic 500.
--
-- security invoker (not definer): this must run with the CALLING user's
-- own privileges, so RLS (breakdown_positions_all_author) is enforced
-- exactly as if the two statements had been run directly — this function
-- doesn't grant anything beyond what the caller could already do via two
-- separate requests, it only makes those two requests atomic. A Postgres
-- function body is an implicit transaction: any exception raised partway
-- through (bad position_id, an RLS violation on the insert, a CHECK
-- violation) rolls back the whole call, including the UPDATE — the
-- specific gap this migration closes.

create or replace function public.tag_position(
  p_breakdown_id uuid,
  p_position_id uuid,
  p_role text,
  p_start_ts numeric
)
returns public.breakdown_positions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.breakdown_positions;
  v_gym_id uuid;
begin
  select gym_id into v_gym_id from public.breakdowns where id = p_breakdown_id;
  if v_gym_id is null then
    raise exception 'breakdown_id does not reference an existing breakdown';
  end if;

  update public.breakdown_positions
  set end_ts = p_start_ts
  where breakdown_id = p_breakdown_id and end_ts is null;

  insert into public.breakdown_positions (breakdown_id, gym_id, position_id, role, start_ts)
  values (p_breakdown_id, v_gym_id, p_position_id, p_role, p_start_ts)
  returning * into result;

  return result;
end;
$$;
