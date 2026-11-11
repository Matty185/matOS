-- Stage L2 (matos_payment_links_plan.md, flow audit 6.6): Stripe tells
-- MatOS when a member pays through the academy's own Payment Link, and the
-- month is marked paid automatically. Still no Stripe Connect: MatOS holds
-- no money and no card data, only the signing secret of a webhook endpoint
-- the owner adds in their own Stripe account.
--
-- * gym_stripe_webhooks: one per gym. endpoint_id is the random public part
--   of the webhook URL; the signing secret (whsec_...) is stored only as
--   AES-256-GCM ciphertext under the server key PAYMENTS_SECRET_KEY, and no
--   client role can read that column. Owners see "connected, last event".
-- * payment_events: one row per Stripe event (unique event id, so a resent
--   event is ignored). Staff read them; only the webhook writes them, through
--   record_stripe_payment() (service_role only, one transaction).
-- * payments.source / external_ref: who wrote a paid row, and the Checkout
--   Session id (unique, so one payment never marks two months).
--
-- No client write policies on gym_stripe_webhooks: the owner routes and the
-- webhook use the service-role client (CLAUDE.md Rule 4, same category as
-- kiosk devices and trial requests). Staff can only mark an event as checked
-- (reviewed_at), through a column grant and a guard trigger.

-- ── gym_stripe_webhooks ─────────────────────────────────────────────────────

create table public.gym_stripe_webhooks (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null unique references public.gyms (id) on delete restrict,
  endpoint_id text not null unique,
  signing_secret_ciphertext text,
  connected_at timestamptz,
  last_event_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint gym_stripe_webhooks_endpoint_shape check (endpoint_id ~ '^[A-Za-z0-9_-]{22,64}$'),
  constraint gym_stripe_webhooks_secret_shape check (
    signing_secret_ciphertext is null
    or signing_secret_ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
  ),
  constraint gym_stripe_webhooks_connected_shape check (
    (signing_secret_ciphertext is null) = (connected_at is null)
  )
);

create index gym_stripe_webhooks_created_by_idx on public.gym_stripe_webhooks (created_by);

alter table public.gym_stripe_webhooks enable row level security;

create policy gym_stripe_webhooks_select_owner on public.gym_stripe_webhooks
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_owner()));

revoke all on public.gym_stripe_webhooks from authenticated, anon;
-- Never the ciphertext.
grant select (id, gym_id, endpoint_id, connected_at, last_event_at, created_at)
  on public.gym_stripe_webhooks to authenticated;

-- ── payments: source and external reference ─────────────────────────────────

alter table public.payments
  add column source text not null default 'manual'
    constraint payments_source_check check (source in ('manual', 'stripe')),
  add column external_ref text
    constraint payments_external_ref_shape check (
      external_ref is null or external_ref ~ '^cs_(test|live)_[A-Za-z0-9]{8,255}$'
    );

create unique index payments_external_ref_unique on public.payments (gym_id, external_ref)
  where external_ref is not null;

-- End-user writes (the coach's record/mark-paid routes, or direct REST) can
-- never claim a row was paid online, and never change the Stripe reference.
-- A manual change to status or amount makes the row manual again; editing
-- only the note keeps "Paid online". SECURITY INVOKER, so current_user is
-- the caller's role.
create function private.payments_source_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.source := 'manual';
      new.external_ref := null;
    else
      new.external_ref := old.external_ref;
      if new.status is distinct from old.status or new.amount is distinct from old.amount then
        new.source := 'manual';
      else
        new.source := old.source;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger payments_source_guard
  before insert or update on public.payments
  for each row execute function private.payments_source_guard();

-- ── payment_events ──────────────────────────────────────────────────────────

create type public.payment_event_outcome as enum (
  'recorded',         -- month marked paid
  'class_payment',    -- pay-per-class member paid for a class; nothing to mark
  'pending',          -- bank payment (e.g. SEPA) started; Stripe confirms later
  'already_paid',     -- the month was already paid or waived; nothing changed
  'failed',           -- a bank payment failed
  'unmatched',        -- the reference didn't match one member of this gym
  'not_billable',     -- matched a member who doesn't owe a monthly fee
  'amount_mismatch',  -- not euro, nothing paid, no plan price, or less than it
  'test_payment'      -- Stripe test mode: listed, never marks a month
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  stripe_event_id text not null,
  event_type text not null,
  checkout_session_id text not null,
  livemode boolean not null,
  member_id uuid references public.members (id) on delete set null,
  period_month smallint,
  period_year smallint,
  amount numeric(10, 2),
  currency text,
  outcome public.payment_event_outcome not null,
  -- Kept only when no member matched, so a coach can work out who paid.
  reference text,
  payer_email text,
  payment_id uuid references public.payments (id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payment_events_event_id_shape check (stripe_event_id ~ '^evt_[A-Za-z0-9]{8,255}$'),
  constraint payment_events_type_check check (
    event_type in (
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed'
    )
  ),
  constraint payment_events_session_shape check (
    checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9]{8,255}$'
  ),
  constraint payment_events_period_check check (
    (period_month is null and period_year is null)
    or (period_month between 1 and 12 and period_year between 2000 and 2100)
  ),
  constraint payment_events_amount_check check (amount is null or amount >= 0),
  constraint payment_events_currency_shape check (currency is null or currency ~ '^[a-z]{3}$'),
  constraint payment_events_reference_len check (reference is null or char_length(reference) <= 200),
  constraint payment_events_payer_email_len check (payer_email is null or char_length(payer_email) <= 320),
  constraint payment_events_unmatched_only check (
    outcome = 'unmatched' or (reference is null and payer_email is null)
  ),
  -- reviewed_by may be nulled later by its FK; it never exists without a time.
  constraint payment_events_reviewed_shape check (reviewed_by is null or reviewed_at is not null),
  -- Per gym: an owner holds their own signing secret, so they could send
  -- events with any ids; a global unique would let them pre-claim another
  -- academy's.
  constraint payment_events_gym_event_unique unique (gym_id, stripe_event_id)
);

create index payment_events_gym_created_idx on public.payment_events (gym_id, created_at desc);
create index payment_events_unmatched_idx on public.payment_events (gym_id, created_at)
  where outcome = 'unmatched' and (reference is not null or payer_email is not null);
create index payment_events_needs_review_idx on public.payment_events (gym_id)
  where reviewed_at is null
    and outcome in ('already_paid', 'failed', 'unmatched', 'not_billable', 'amount_mismatch');
create index payment_events_member_id_idx on public.payment_events (member_id);
create index payment_events_payment_id_idx on public.payment_events (payment_id);
create index payment_events_reviewed_by_idx on public.payment_events (reviewed_by);

alter table public.payment_events enable row level security;

create policy payment_events_select_staff on public.payment_events
  for select to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

create policy payment_events_update_staff on public.payment_events
  for update to authenticated
  using (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()))
  with check (gym_id = (select private.my_gym_id()) and (select private.is_coach_or_owner()));

revoke all on public.payment_events from authenticated, anon;
grant select on public.payment_events to authenticated;
grant update (reviewed_at) on public.payment_events to authenticated;

-- Staff may only mark an event checked (stamped with who and when) or clear
-- that again. Checking an unmatched event drops the payer's reference and
-- email: the coach has dealt with it. SECURITY INVOKER, so current_user is
-- the caller's role.
create function private.payment_events_review_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.reviewed_at is null then
      new.reviewed_by := null;
    else
      new.reviewed_at := now();
      new.reviewed_by := auth.uid();
      new.reference := null;
      new.payer_email := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger payment_events_review_guard
  before update on public.payment_events
  for each row execute function private.payment_events_review_guard();

-- ── record_stripe_payment ───────────────────────────────────────────────────
--
-- Called only by POST /api/stripe/webhook/[endpointId] after it has verified
-- the Stripe signature with that gym's secret. The endpoint decides the gym.
-- The route resolves the member from the payment reference within that gym
-- and works out the expected fee; this function re-checks the member is in
-- the gym, then records the event and (when everything matches) marks the
-- month paid, all in one transaction. Returns the outcome, or 'duplicate'
-- for an event already handled.

create function public.record_stripe_payment(
  p_gym_id uuid,
  p_event_id text,
  p_event_type text,
  p_session_id text,
  p_livemode boolean,
  p_payment_status text,
  p_member_id uuid,
  p_period_month smallint,
  p_period_year smallint,
  p_is_class boolean,
  p_amount_cents bigint,
  p_currency text,
  p_expected_cents bigint,
  p_reference text,
  p_payer_email text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_role public.member_role;
  v_plan public.membership_plan;
  v_existing_id uuid;
  v_existing_status public.payment_status;
  v_existing_ref text;
  v_outcome public.payment_event_outcome;
  v_amount numeric(10, 2);
  v_payment_id uuid;
begin
  -- Serialise every event for one Checkout Session (completed, then the
  -- later async success or failure), and make retries of one event no-ops.
  perform pg_advisory_xact_lock(
    hashtextextended('stripe_session:' || p_gym_id::text || ':' || p_session_id, 0)
  );
  if exists (
    select 1 from public.payment_events
    where gym_id = p_gym_id and stripe_event_id = p_event_id
  ) then
    return 'duplicate';
  end if;

  -- Retention: an unmatched payer's reference and email are kept 12 months.
  update public.payment_events
    set reference = null, payer_email = null
    where gym_id = p_gym_id
      and outcome = 'unmatched'
      and (reference is not null or payer_email is not null)
      and created_at < now() - interval '12 months';

  v_amount := case when p_amount_cents is null then null else p_amount_cents / 100.0 end;

  if p_member_id is not null then
    select id, role, membership_plan into v_member_id, v_role, v_plan
      from public.members
      where id = p_member_id and gym_id = p_gym_id;
  end if;

  if not p_livemode or p_session_id like 'cs_test_%' then
    -- Test mode never marks a real month paid (a test link left on a plan
    -- plus a test card would otherwise be free). Listed so the owner can see
    -- the setup works.
    v_outcome := 'test_payment';
  elsif v_member_id is null then
    v_outcome := 'unmatched';
  elsif p_event_type = 'checkout.session.async_payment_failed' then
    v_outcome := 'failed';
  elsif p_payment_status is null or p_payment_status not in ('paid', 'no_payment_required') then
    v_outcome := 'pending';
  elsif p_is_class then
    v_outcome := 'class_payment';
  elsif v_role <> 'athlete' or v_plan = 'casual' then
    v_outcome := 'not_billable';
  elsif p_period_month is null or p_period_year is null then
    v_outcome := 'unmatched';
  elsif p_currency is distinct from 'eur'
     or p_amount_cents is null
     or p_amount_cents <= 0
     -- No plan price means the amount can't be checked: a member could pay
     -- through any cheaper link in the same Stripe account. A coach decides.
     or p_expected_cents is null
     or p_amount_cents < p_expected_cents then
    v_outcome := 'amount_mismatch';
  else
    -- Serialise two different payments for the same member and month, so
    -- the second is flagged instead of overwriting the first.
    perform pg_advisory_xact_lock(
      hashtextextended(
        'stripe_month:' || v_member_id::text || ':' || p_period_year || '-' || p_period_month, 0
      )
    );
    select id, status, external_ref into v_existing_id, v_existing_status, v_existing_ref
      from public.payments
      where member_id = v_member_id
        and period_month = p_period_month
        and period_year = p_period_year
      for update;

    if v_existing_id is not null and v_existing_ref = p_session_id and v_existing_status = 'paid' then
      -- This session already marked the month (an earlier event).
      v_outcome := 'recorded';
      v_payment_id := v_existing_id;
    elsif v_existing_id is not null
       and (v_existing_status in ('paid', 'waived') or v_existing_ref = p_session_id) then
      -- Already settled, or a coach set this session's month back to unpaid
      -- (a refund): don't override them.
      v_outcome := 'already_paid';
      v_payment_id := v_existing_id;
    elsif exists (
      select 1 from public.payments where gym_id = p_gym_id and external_ref = p_session_id
    ) then
      -- This session already paid a different month.
      v_outcome := 'already_paid';
    else
      insert into public.payments as p (
        member_id, gym_id, period_month, period_year, status, amount, paid_at,
        recorded_by, source, external_ref
      ) values (
        v_member_id, p_gym_id, p_period_month, p_period_year, 'paid', v_amount, now(),
        null, 'stripe', p_session_id
      )
      on conflict (member_id, period_month, period_year) do update
        set status = 'paid',
            amount = excluded.amount,
            paid_at = excluded.paid_at,
            recorded_by = null,
            source = 'stripe',
            external_ref = excluded.external_ref
        -- A coach may have marked it in the instant since the select.
        where p.status = 'unpaid'
      returning p.id into v_payment_id;
    end if;

    if v_outcome is null and v_payment_id is null then
      select id into v_payment_id
        from public.payments
        where member_id = v_member_id
          and period_month = p_period_month
          and period_year = p_period_year;
      v_outcome := 'already_paid';
    elsif v_outcome is null then
      insert into public.audit_log (
        gym_id, actor_id, action, entity_type, entity_id, before_state, after_state, initiated_by
      ) values (
        p_gym_id, null, 'payment.paid_online', 'payments', v_payment_id,
        case when v_existing_id is null then null
             else jsonb_build_object('status', v_existing_status) end,
        jsonb_build_object(
          'status', 'paid',
          'amount', v_amount,
          'period_month', p_period_month,
          'period_year', p_period_year,
          'source', 'stripe',
          'livemode', p_livemode
        ),
        'payment_provider'
      );
      v_outcome := 'recorded';
    end if;
  end if;

  insert into public.payment_events (
    gym_id, stripe_event_id, event_type, checkout_session_id, livemode, member_id,
    period_month, period_year, amount, currency, outcome, reference, payer_email, payment_id
  ) values (
    p_gym_id, p_event_id, p_event_type, p_session_id, p_livemode, v_member_id,
    case when p_is_class then null else p_period_month end,
    case when p_is_class then null else p_period_year end,
    v_amount, p_currency, v_outcome,
    case when v_outcome = 'unmatched' then left(p_reference, 200) end,
    case when v_outcome = 'unmatched' then left(p_payer_email, 320) end,
    v_payment_id
  );

  update public.gym_stripe_webhooks set last_event_at = now() where gym_id = p_gym_id;

  return v_outcome::text;
end;
$$;

revoke all on function public.record_stripe_payment(
  uuid, text, text, text, boolean, text, uuid, smallint, smallint, boolean, bigint, text, bigint, text, text
) from public, anon, authenticated;
grant execute on function public.record_stripe_payment(
  uuid, text, text, text, boolean, text, uuid, smallint, smallint, boolean, bigint, text, bigint, text, text
) to service_role;
