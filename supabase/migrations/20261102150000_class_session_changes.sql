-- P1 (flow audit 3.2): cancel or move one session of a recurring class.
--
-- Classes stay a weekly template (CLAUDE.md rule 7). This adds a small
-- per-date *exception* table instead of per-session instances (out of scope):
-- a row says "the <class> session normally on <session_date> is cancelled",
-- or "...is moved to <new_date> at <new_start_time>". Every date with no row
-- keeps running from the template, so nothing about the template changes and
-- a later refactor to real session instances can convert these rows directly.
--
-- Rules enforced here (the route adds friendlier checks on top):
--   * session_date falls on the class's weekday (trigger) — an exception for a
--     date the class never runs on is meaningless.
--   * One change per class per date (unique). To change a change, undo it.
--   * A move stays within six days of the original date. That keeps every
--     class to at most one session per calendar date, which the attendance
--     unique key (member, class, checked_in_date) relies on.
--   * Two moved sessions of the same class can't land on the same date.
--   * gym_id is derived from the class (trigger, like attendance), so RLS's
--     gym check below also proves the class is in the caller's gym.
--
-- Readable by every member of the gym (athletes need to see a cancellation);
-- written by coaches/owners. No UPDATE policy: undo + redo instead, which
-- keeps the audit trail simple. Deleting a class (only possible with no
-- attendance history) takes its exceptions with it.

create type public.class_session_change_kind as enum ('cancelled', 'moved');

create table public.class_session_changes (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  class_id uuid not null references public.classes (id) on delete cascade,
  session_date date not null,
  kind public.class_session_change_kind not null,
  new_date date,
  new_start_time time,
  note text,
  created_at timestamptz not null default now(),
  constraint class_session_changes_one_per_date unique (class_id, session_date),
  constraint class_session_changes_shape check (
    (kind = 'cancelled' and new_date is null and new_start_time is null)
    or (
      kind = 'moved'
      and new_date is not null
      and new_start_time is not null
      and abs(new_date - session_date) <= 6
    )
  ),
  constraint class_session_changes_note_len check (
    note is null or char_length(note) between 1 and 200
  )
);

create unique index class_session_changes_moved_target_unique
  on public.class_session_changes (class_id, new_date)
  where kind = 'moved';

-- Reads are always "this gym, a window of dates".
create index class_session_changes_gym_date_idx
  on public.class_session_changes (gym_id, session_date);

create or replace function public.class_session_changes_derive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_gym uuid;
  c_dow smallint;
begin
  select gym_id, day_of_week into c_gym, c_dow from public.classes where id = new.class_id;
  if c_gym is null then
    raise exception 'class_id does not reference an existing class';
  end if;
  if extract(dow from new.session_date)::smallint <> c_dow then
    raise exception 'session_date is not a day this class runs'
      using errcode = '22023';
  end if;
  new.gym_id = c_gym;
  return new;
end;
$$;

revoke all on function public.class_session_changes_derive() from public, anon, authenticated;

create trigger class_session_changes_derive
  before insert or update on public.class_session_changes
  for each row execute function public.class_session_changes_derive();

alter table public.class_session_changes enable row level security;

create policy class_session_changes_select_gym on public.class_session_changes
  for select to authenticated
  using (gym_id = (select private.my_gym_id()));

create policy class_session_changes_insert_staff on public.class_session_changes
  for insert to authenticated
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy class_session_changes_delete_staff on public.class_session_changes
  for delete to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

-- TRUNCATE bypasses RLS and triggers; the project revokes it on every new
-- table (see 20260723190000, fix 4). No UPDATE policy exists — undo + redo
-- only — and the revoke makes that explicit.
revoke truncate on public.class_session_changes from authenticated, anon;
revoke update on public.class_session_changes from authenticated, anon;

-- If a class moves to another weekday in the template, its exceptions no
-- longer describe real sessions. The schedule already ignores them
-- (sessionsOnDate), but left in place they would still block new changes via
-- the unique keys and silently come back if the class were switched back.
-- Remove them with the edit. Runs as the editing coach under RLS
-- (delete_staff), which a coach editing their own gym's class always passes.
create or replace function public.class_session_changes_drop_stale()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.class_session_changes
  where class_id = new.id
    and extract(dow from session_date)::smallint <> new.day_of_week;
  return null;
end;
$$;

revoke all on function public.class_session_changes_drop_stale() from public, anon, authenticated;

create trigger classes_drop_stale_session_changes
  after update of day_of_week on public.classes
  for each row
  when (old.day_of_week is distinct from new.day_of_week)
  execute function public.class_session_changes_drop_stale();
