-- Stage M3 all-reviewer gate fix: database-reviewer found that neither
-- breakdown_positions nor breakdown_events creates are idempotent, and
-- mobile's offline sync engine (which retries a create whenever a POST's
-- response is lost — e.g. a dropped mobile connection after the server
-- already committed the insert) has no way to recognize "this already
-- happened." Combined with no in-flight guard on the sync loop (fixed
-- separately, app-side, in the same review round), this produced a
-- concrete, non-hypothetical path to silent data corruption: a duplicate
-- POST for the same tag both hits tag_position, and each is a genuinely
-- separate successful call — the second finds the first's row "open" and
-- closes it (often at the same start_ts, satisfying every existing CHECK/
-- unique constraint) and inserts a third phantom row. Only the last
-- response's id survives into the local draft; the earlier row becomes a
-- permanently invisible, permanently present ghost interval, silently
-- corrupting profile-metric aggregation (Non-Negotiable #6).
--
-- Fix: a client-generated id, set the instant a tag is created locally
-- (before any network round trip — mobile already generates one per tag
-- for its own local draft bookkeeping), persisted and uniquely
-- constrained per breakdown. A retried create for the same client_id is a
-- safe no-op that returns the original row instead of inserting again.

alter table public.breakdown_positions add column client_id uuid;
alter table public.breakdown_events add column client_id uuid;

-- Partial (not NOT NULL): web's own tagging screen has no offline/retry
-- concern (direct save per action, no local draft) and never sets this —
-- existing and future web-created rows stay client_id null, exempt from
-- the uniqueness check below.
create unique index breakdown_positions_client_id_unique
  on public.breakdown_positions (breakdown_id, client_id)
  where client_id is not null;

create unique index breakdown_events_client_id_unique
  on public.breakdown_events (breakdown_id, client_id)
  where client_id is not null;

-- create or replace does NOT replace a function whose parameter list
-- differs — adding p_client_id makes this a distinct 5-arg overload,
-- silently leaving the original 4-arg tag_position (no idempotency
-- check, no client_id write) live alongside it. Drop it explicitly first
-- so callers can't accidentally resolve to the stale overload.
drop function if exists public.tag_position(uuid, uuid, text, numeric);

-- tag_position: check for an existing row with this client_id first,
-- before the close-open+insert logic. The check-then-insert has a race
-- window (not a single atomic statement), but that window is now safe
-- rather than silently corrupting: two genuinely concurrent calls with
-- the same client_id both miss the SELECT, both proceed, and the second
-- INSERT hits breakdown_positions_client_id_unique and raises 23505 —
-- already mapped by apps/web's mapBreakdownTagError to a clean 409
-- CONCURRENT_EDIT rather than a silent phantom row.
create or replace function public.tag_position(
  p_breakdown_id uuid,
  p_position_id uuid,
  p_role text,
  p_start_ts numeric,
  p_client_id uuid default null
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
  if p_client_id is not null then
    select * into result
    from public.breakdown_positions
    where breakdown_id = p_breakdown_id and client_id = p_client_id;
    if found then
      return result;
    end if;
  end if;

  select gym_id into v_gym_id from public.breakdowns where id = p_breakdown_id;
  if v_gym_id is null then
    raise exception 'breakdown_id does not reference an existing breakdown';
  end if;

  update public.breakdown_positions
  set end_ts = p_start_ts
  where breakdown_id = p_breakdown_id and end_ts is null;

  insert into public.breakdown_positions (breakdown_id, gym_id, position_id, role, start_ts, client_id)
  values (p_breakdown_id, v_gym_id, p_position_id, p_role, p_start_ts, p_client_id)
  returning * into result;

  return result;
end;
$$;
