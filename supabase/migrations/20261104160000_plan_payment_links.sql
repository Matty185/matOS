-- Flow audit 6.6, stage L1 (matos_payment_links_plan.md): a Stripe Payment
-- Link per membership plan. Members see "Pay online" and pay on Stripe's
-- own page into the gym's own Stripe account; the coach then marks the
-- month paid as before. MatOS stores no secrets and moves no money.
--
-- Only real Stripe Payment Link URLs are accepted (no other host, no query
-- string — the app adds client_reference_id / prefilled_email itself), so a
-- link can't be turned into a redirect to an arbitrary site. Owner-only, via
-- the existing gym_plans_update_owner policy and column grant.

alter table public.gym_plans
  add column payment_link_url text
    check (
      payment_link_url is null
      or payment_link_url ~ '^https://buy\.stripe\.com/[A-Za-z0-9_-]{6,100}$'
    );

grant update (payment_link_url) on public.gym_plans to authenticated;
