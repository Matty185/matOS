-- P1 (flow audit 5.3): promotion readiness.
--
-- A. Per-gym guidance for "ready for the next stripe": a number of classes
--    and a number of months since the member's last promotion. Guidance only
--    — coaches still decide; nothing is promoted automatically. NULL turns a
--    criterion off. Defaults (30 classes, 3 months) are a common starting
--    point; the owner edits them in Settings. Owners may update these under
--    the existing gyms_update_owner policy (the column guard is a denylist
--    of kind/active/created_at/id).
--
-- B. public.promotion_progress(p_member_id) — for each active member, their
--    most recent belt_history row (a real promotion, or the starting rank)
--    and how many classes they've attended since. SECURITY INVOKER: RLS on
--    members / belt_history / attendance decides what the caller sees —
--    staff get their gym, an athlete gets only themselves. Computed in SQL so
--    the client never downloads every attendance row.
--
--    "Since" is strictly after the promotion instant, so a class checked in
--    earlier on promotion day doesn't count towards the next stripe. For a
--    starting rank (is_initial) the count covers attendance recorded in
--    MatOS — earlier history doesn't exist here, and the UI says so.

-- ── A. gym guidance ────────────────────────────────────────────────────────
alter table public.gyms
  add column promotion_classes_per_stripe smallint default 30
    check (promotion_classes_per_stripe is null or promotion_classes_per_stripe between 1 and 500),
  add column promotion_months_per_stripe smallint default 3
    check (promotion_months_per_stripe is null or promotion_months_per_stripe between 1 and 60);

-- At least one criterion stays on (gate review): mirrors the Zod rule for
-- direct REST callers. Personal workspaces get the defaults too; harmless.
alter table public.gyms
  add constraint gyms_promotion_rule_not_empty
    check (promotion_classes_per_stripe is not null or promotion_months_per_stripe is not null);

-- ── B. progress ────────────────────────────────────────────────────────────
-- Covers "count this member's attendance after a timestamp" (the existing
-- unique index leads with member_id but then class_id, so it can't range
-- over checked_in_at).
create index if not exists attendance_member_checked_in_at_idx
  on public.attendance (member_id, checked_in_at);
-- Gate review: the new index's leftmost prefix covers the old single-column
-- one (same cleanup as memberships_user_id_idx / push_tokens_member_id_idx).
drop index if exists public.attendance_member_id_idx;

create or replace function public.promotion_progress(p_member_id uuid default null)
returns table (
  member_id uuid,
  last_promoted_at timestamptz,
  last_is_initial boolean,
  classes_since bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with last_rank as (
    select distinct on (bh.member_id)
      bh.member_id, bh.promoted_at, bh.is_initial
    from public.belt_history bh
    where p_member_id is null or bh.member_id = p_member_id
    -- Latest first; on an exact tie prefer the real promotion.
    order by bh.member_id, bh.promoted_at desc, bh.is_initial asc
  )
  select
    m.id,
    coalesce(lr.promoted_at, m.join_date::timestamptz),
    coalesce(lr.is_initial, true),
    (
      select count(*)
      from public.attendance a
      where a.member_id = m.id
        and a.checked_in_at > coalesce(lr.promoted_at, m.join_date::timestamptz)
    )
  from public.members m
  left join last_rank lr on lr.member_id = m.id
  where m.active
    and (p_member_id is null or m.id = p_member_id);
$$;

revoke execute on function public.promotion_progress(uuid) from public, anon;
grant execute on function public.promotion_progress(uuid) to authenticated;
