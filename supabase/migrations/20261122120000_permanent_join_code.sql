-- A permanent join QR code for the academy wall.
--
-- The 24-hour group code (20261106120000) is safe enough because it's
-- short-lived. A code that never expires, printed on a poster, can be
-- photographed and used by anyone, forever. So a permanent code never makes
-- anyone a member directly: each sign-up waits as "pending approval" (an
-- inactive member row, so RLS gives the login no access to anything) until
-- a coach approves it. A coach can also reject it, which removes the row and
-- the login.
--
-- * signup_links.permanent: one live permanent code per academy (owner
--   only). Its expiry is far in the future; cancelling sets used_at.
--   display_token keeps the raw code so the owner can show or reprint the
--   poster later. It's printed on a wall, so it isn't a secret beyond that;
--   staff can read it like the rest of the row.
-- * signup_links.requires_approval: set for permanent codes (and only
--   meaningful there for now).
-- * members.pending_approval: a sign-up waiting for a coach. Never active at
--   the same time. End users can only clear it (approve), never set it.
-- * my_signup_status(): lets a pending login see which academy it's
--   waiting on, since RLS hides its own inactive member row.

-- ── signup_links ────────────────────────────────────────────────────────────

alter table public.signup_links
  add column permanent boolean not null default false,
  add column requires_approval boolean not null default false,
  add column display_token text;

-- The original inline check (max_uses between 1 and 100), by its default name.
alter table public.signup_links
  drop constraint if exists signup_links_max_uses_check;

alter table public.signup_links
  add constraint signup_links_max_uses_range check (
    (not permanent and max_uses between 1 and 100)
    or (permanent and max_uses = 32000)
  ),
  -- A live permanent code keeps its token for reprinting; cancelling clears it.
  add constraint signup_links_permanent_shape check (
    not permanent or (requires_approval and (display_token is not null or used_at is not null))
  ),
  add constraint signup_links_display_token_only_permanent check (
    display_token is null or permanent
  );

-- One live permanent code per academy, enforced by the database.
create unique index signup_links_one_permanent_per_gym
  on public.signup_links (gym_id)
  where permanent and used_at is null;

-- ── members.pending_approval ────────────────────────────────────────────────

alter table public.members
  add column pending_approval boolean not null default false,
  add constraint members_pending_not_active check (not (pending_approval and active));

create index members_pending_approval_idx on public.members (gym_id)
  where pending_approval;

-- End users never put anyone into pending, and only a coach or owner of the
-- row's academy can take someone out of it (approve), never for their own
-- row: members_update_self would otherwise let a pending login clear its own
-- flag. SECURITY INVOKER, so current_user is the caller.
create function private.members_pending_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.pending_approval then
      raise exception 'pending_approval is set only by a sign-up' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.pending_approval and not old.pending_approval then
      raise exception 'pending_approval is set only by a sign-up' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.pending_approval and not new.pending_approval and (
      new.user_id is not distinct from auth.uid()
      or new.gym_id is distinct from private.my_gym_id()
      or not private.is_coach_or_owner()
    ) then
      raise exception 'only a coach can approve a sign-up' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger members_pending_guard
  before insert or update of pending_approval on public.members
  for each row execute function private.members_pending_guard();

-- ── redeem_signup_link ──────────────────────────────────────────────────────
-- Same function and arguments as 20261106120000. Changes: a code that needs
-- approval creates an inactive, pending member, and refuses once 25 sign-ups
-- are already waiting in the academy (so a photographed poster can't flood
-- the roster).

create or replace function public.redeem_signup_link(
  p_link_id uuid,
  p_user_id uuid,
  p_details jsonb,
  p_consent_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.signup_links%rowtype;
  v_gym public.gyms%rowtype;
  v_email text := lower(btrim(p_details->>'email'));
  v_belt public.belt_color := coalesce(nullif(p_details->>'belt', ''), 'white')::public.belt_color;
  v_stripes smallint := coalesce(nullif(p_details->>'stripes', '')::smallint, 0);
  v_today date;
  v_member_id uuid;
begin
  select * into v_link from public.signup_links where id = p_link_id for update;
  if not found
    or v_link.used_at is not null
    or v_link.use_count >= v_link.max_uses
    or v_link.expires_at <= now() then
    raise exception 'sign-up link unavailable' using errcode = 'P0001', hint = 'LINK_UNAVAILABLE';
  end if;

  select * into v_gym from public.gyms where id = v_link.gym_id;
  if v_gym.kind <> 'gym' or not v_gym.active then
    raise exception 'sign-up link unavailable' using errcode = 'P0001', hint = 'LINK_UNAVAILABLE';
  end if;

  if exists (select 1 from public.members where gym_id = v_gym.id and user_id = p_user_id) then
    raise exception 'already a member' using errcode = 'P0001', hint = 'ALREADY_MEMBER';
  end if;
  if exists (select 1 from public.members where gym_id = v_gym.id and lower(email) = v_email) then
    raise exception 'email already on roster' using errcode = 'P0001', hint = 'EMAIL_IN_GYM';
  end if;
  if v_link.requires_approval
     and (select count(*) from public.members where gym_id = v_gym.id and pending_approval) >= 25 then
    raise exception 'too many waiting' using errcode = 'P0001', hint = 'TOO_MANY_PENDING';
  end if;

  v_today := (now() at time zone v_gym.timezone)::date;

  insert into public.members (
    gym_id, user_id, role, first_name, last_name, email, phone,
    emergency_contact_name, emergency_contact_phone, belt, stripes, join_date,
    active, pending_approval
  ) values (
    v_gym.id,
    p_user_id,
    'athlete',
    btrim(p_details->>'first_name'),
    btrim(p_details->>'last_name'),
    v_email,
    nullif(btrim(p_details->>'phone'), ''),
    nullif(btrim(p_details->>'emergency_contact_name'), ''),
    nullif(btrim(p_details->>'emergency_contact_phone'), ''),
    v_belt,
    v_stripes,
    v_today,
    not v_link.requires_approval,
    v_link.requires_approval
  )
  returning id into v_member_id;

  -- members_sync_memberships copies members.active into memberships.active.
  -- A pending row is inactive, so set the membership active now: access is
  -- still refused while members.active is false, and approving (which flips
  -- only members.active) then lets them in.
  if v_link.requires_approval then
    update public.memberships set active = true
      where user_id = p_user_id and gym_id = v_gym.id;
  end if;

  insert into public.belt_history (member_id, gym_id, belt, stripes, promoted_at, is_initial, notes)
  values (v_member_id, v_gym.id, v_belt, v_stripes, now(), true, 'Starting rank (self-reported at sign-up)');

  insert into public.gdpr_consents (member_id, gym_id, data_storage_consent, consented_at, consent_version)
  values (v_member_id, v_gym.id, true, now(), p_consent_version);

  update public.signup_links
    set use_count = use_count + 1,
        used_at = case when use_count + 1 >= max_uses then now() else null end,
        used_by_member_id = case when max_uses = 1 then v_member_id else null end
    where id = v_link.id;

  return v_member_id;
end;
$$;

revoke execute on function public.redeem_signup_link(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.redeem_signup_link(uuid, uuid, jsonb, text) to service_role;

-- ── my_signup_status ────────────────────────────────────────────────────────
-- For a login whose only membership is waiting for approval: the academy
-- name, so the app can say "waiting for Northside BJJ to approve you".
-- Returns nothing about anyone else.

create function public.my_signup_status()
returns table (gym_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select g.name
  from public.members m
  join public.gyms g on g.id = m.gym_id
  where m.user_id = auth.uid() and m.pending_approval
  order by m.created_at desc
  limit 1;
$$;

revoke execute on function public.my_signup_status() from public, anon;
grant execute on function public.my_signup_status() to authenticated;

-- ── reject_pending_signup ───────────────────────────────────────────────────
-- Called by POST /api/members/[id]/reject (service role) after an RLS read
-- confirmed the row is in the coach's academy. Removes a sign-up that is
-- still waiting for approval, in one transaction: refuses if anything else
-- has been recorded against it (attendance, a payment, an invite, a match),
-- so nothing is half-deleted. Returns the user id, so the route can remove
-- the login if it belongs nowhere else.

create function public.reject_pending_signup(p_member_id uuid, p_gym_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
    from public.members
    where id = p_member_id and gym_id = p_gym_id and pending_approval
    for update;
  if not found then
    raise exception 'not pending' using errcode = 'P0001', hint = 'NOT_PENDING';
  end if;

  if exists (select 1 from public.attendance where member_id = p_member_id)
     or exists (select 1 from public.payments where member_id = p_member_id)
     or exists (select 1 from public.invites where member_id = p_member_id)
     or exists (select 1 from public.athlete_logs where member_id = p_member_id)
     or exists (select 1 from public.deletion_requests where member_id = p_member_id)
     or exists (select 1 from public.breakdowns where member_id = p_member_id) then
    raise exception 'has records' using errcode = 'P0001', hint = 'HAS_RECORDS';
  end if;

  delete from public.belt_history where member_id = p_member_id;
  delete from public.gdpr_consents where member_id = p_member_id;
  if v_user_id is not null then
    delete from public.memberships where user_id = v_user_id and gym_id = p_gym_id;
  end if;
  delete from public.members where id = p_member_id;

  return v_user_id;
end;
$$;

revoke execute on function public.reject_pending_signup(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reject_pending_signup(uuid, uuid) to service_role;

-- ── increment_permanent_attempt ─────────────────────────────────────────────
-- The permanent code can't lock for good (anyone could then kill the poster),
-- but it can't allow unlimited tries either: failed attempts tell whether an
-- email is on the roster or has an account. So it counts attempts in a
-- rolling hour; the route refuses above the hourly limit and the count
-- starts again after an hour.

alter table public.signup_links
  add column attempt_window_started_at timestamptz;

create function public.increment_permanent_attempt(p_link_id uuid)
returns int
language sql
security definer
set search_path = ''
as $$
  update public.signup_links
    set attempt_count = case
          when attempt_window_started_at is null
            or attempt_window_started_at < now() - interval '1 hour' then 1
          else least(attempt_count + 1, 32000)
        end,
        attempt_window_started_at = case
          when attempt_window_started_at is null
            or attempt_window_started_at < now() - interval '1 hour' then now()
          else attempt_window_started_at
        end
  where id = p_link_id and permanent
  returning attempt_count;
$$;

revoke execute on function public.increment_permanent_attempt(uuid) from public, anon, authenticated;
grant execute on function public.increment_permanent_attempt(uuid) to service_role;
