# MatOS — Online Payments via Stripe Payment Links (flow audit 6.6, option 1)

Status: **L1 built 2026-11-04** (see the CLAUDE.md Decision Log); L2 not started. Scope: the web app only. Same staged-with-explicit-go-ahead
discipline and review gates as every other plan. Where this conflicts with `matos_project_plan.md`
for payments scope, this plan wins once its Decision Log entry is written.

## 1. The idea

Each gym uses **its own Stripe account**, which is free to open and has no monthly fee. The owner
creates a Stripe Payment Link for each plan (for example "Adults monthly €60") and pastes it into
MatOS. Members see a **Pay online** button on their Membership card. Stripe takes the money and its
fee goes straight to the gym's Stripe balance. MatOS never holds money, card details or Stripe API keys.

The costs are Stripe's per-payment fees only, taken from each payment, with nothing upfront: roughly
1.5% + €0.25 for an EEA card, or about €0.35 for SEPA Direct Debit. Check Stripe's Ireland pricing
page for current figures.

**Scope rule.** CLAUDE.md lists "payment processing" as out of scope. MatOS still doesn't _process_
payments, because Stripe does. MatOS shows a link and records the result. A Decision Log entry records
this as a deliberate, narrow change, so it isn't a silent deviation.

## 2. Stages

### L1 — Pay links, recorded by the coach (no webhook)

The smallest useful version. Nothing secret is stored.

- **Schema** (one migration): `gym_plans.payment_link_url text`, nullable.
  - Database check: it must match `^https://buy\.stripe\.com/[A-Za-z0-9_-]{6,100}$`, with no other
    hosts, no `javascript:` and no query string. MatOS adds the query itself (below).
  - The existing owner-only update grant gains the column.
- **Settings → Membership plans:** a "Stripe payment link" field per plan, with short help text
  ("Create a Payment Link in Stripe for this plan's price and paste it here").
  - Pay-per-class plans may have a link too, for a single class or a class card.
  - A link setup guide: `matos_stripe_setup.md`, written like `matos_email_setup.md`.
- **Member side:** a **Pay online** button on the Membership card on athlete Home and on each child's
  card on Family.
  - It shows only when the member's plan has a link and there is something to pay: this month unpaid,
    or overdue months.
  - It opens Stripe in a new tab (`rel="noopener noreferrer"`) with two query parameters, which
    Payment Links support:
    - `client_reference_id = <member_id>_<YYYY>_<MM>`, the oldest unpaid billable month. It shows on the
      payment in Stripe and in exports, so the coach can see whose payment it was and for which month.
    - `prefilled_email`, when the member has an email.
  - Text under the button: "You'll pay on Stripe's secure page. Your coach marks the month paid once it
    comes through."
- **Coach side:** no new screen.
  - The coach sees payments in their Stripe dashboard or app, and marks the month paid as today, with
    the plan price already pre-filled since batch 2.
  - The payments grid and profile show a small "Pays online" hint when the plan has a link.
- **Audit:** `gym.plan_updated` already covers link changes. Make it strict for this field, because a
  wrong link sends members' money elsewhere, so it can't be best effort.
- **Gate:** security-reviewer (URL handling, open-redirect and phishing risk from a malicious owner)
  plus code-reviewer. Small enough for one round.
- **Test:** live, with a real Stripe _test-mode_ link (`https://buy.stripe.com/test_…`). See §4.

### L2 — Automatic recording via webhook (optional, after L1 has been used)

Stripe tells MatOS when a payment succeeds, and the month is marked paid automatically.

- **Owner setup:** in their own Stripe dashboard, the owner adds a webhook endpoint
  `https://<app>/api/stripe/webhook/<gym_webhook_id>` for `checkout.session.completed`,
  `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`. They then
  paste the endpoint's signing secret (`whsec_…`) into Settings.
- **Schema** (BLOCKING database + security review):
  - `gym_stripe_webhooks`:
    - Columns: `gym_id` (unique), a random public `endpoint_id`, `signing_secret_ciphertext`,
      `created_at`, `last_event_at`.
    - The secret is encrypted with AES-256-GCM using a server key from a new env var
      `PAYMENTS_SECRET_KEY` (free, set once in Vercel).
    - No client can read the secret column. Owners see only "connected, last event …".
  - `payment_events`:
    - Columns: `stripe_event_id` (unique, so a resent event is ignored), `gym_id`, `type`,
      `member_id`, `period`, `amount`, `outcome`, `created_at`.
    - Outcome is one of `recorded`, `already_paid`, `unmatched` or `failed`.
    - Staff read it; only the webhook writes it.
  - `payments.source` (`manual` / `stripe`) and `payments.external_ref` (the Checkout Session id,
    unique), so a payment is never recorded twice.
  - A new `initiated_by` enum value `payment_provider`, in its own migration file, because enum
    additions can't run in the same transaction.
- **Route** `POST /api/stripe/webhook/[endpointId]`: public, service role. This is a Rule 4 addition,
  in the same category as kiosk and trial requests.
  1. Read the raw body and verify the `Stripe-Signature` header against that gym's decrypted secret,
     with a 5-minute tolerance. Use the official `stripe` npm package's `constructEvent`; it's free.
  2. Ignore any event not in the list, and any `livemode` mismatch against the gym's setting.
  3. Parse `client_reference_id`, which L1 ships as `Name-Surname_YYYY-MM_<id8>` or
     `Name-Surname_class_<id8>`. Resolve the 8-character member id prefix within this gym; if it
     matches more than one member, mark the event `unmatched`. The member must belong to **this** gym. The endpoint id decides
     the gym; the reference never does.
  4. Mark the month paid only if `payment_status = paid`. SEPA payments are confirmed days later
     through `async_payment_succeeded`.
  5. If the month is already paid, record the event as `already_paid` and change nothing. The coach
     sees it (see below).
  6. Reply 200 quickly, including for ignored events, so Stripe doesn't retry forever. Reply 400 only
     for a bad signature.
  7. Rate limit per endpoint.
- **Coach side:**
  - A paid month shows "Paid online".
  - A "Needs a look" list on Payments for `unmatched`, `already_paid` and `failed` events, such as a
    member paying twice or a reference that doesn't match anyone.
  - A dashboard count.
- **GDPR:** `payment_events` hold member ids and amounts. Erasure deletes or anonymises them like
  `payments`, and the export includes them.
- **Gate:** database + security BLOCKING, plus code.
- **Test:** Stripe CLI (`stripe listen --forward-to localhost`, `stripe trigger`) against a test-mode
  account. The signature logic can also be tested without an account using locally signed payloads.

### L3 — Not planned

These are listed so they aren't assumed.

- **Recurring subscriptions** (members charged automatically every month): Payment Links can create
  subscriptions. Recording each month's renewal needs `invoice.paid` handling and a member ↔ Stripe
  customer mapping, and freezes would need to pause the subscription. That's option 2 territory
  (Stripe Connect).
- **Refunds and disputes in MatOS:** the coach handles these in Stripe and corrects the month by hand.
- **MatOS taking a cut of payments:** this needs Connect.

## 3. What stays the same

- Rule 8: overdue is still computed at query time from `payments`. Online payment only changes _who
  writes_ the paid row.
- Rule 3: members already see their plan price on Stripe's page. The app still never shows them
  `payments.amount`.
- Coaches can always mark paid, waive or freeze by hand. Online payment is an extra way to pay, never
  the only one.
- Gyms without a link see no change.

## 4. What I need from you

- **For L1:** nothing to build it. To test it live, either a Stripe account in **test mode** with one
  test Payment Link pasted in, or I test with a link-shaped URL and a dummy Stripe page check.
- **For L2:** the same test account, the Stripe CLI (free) for sending test webhooks, and the new
  `PAYMENTS_SECRET_KEY` env var in Vercel (I'll generate the value; you paste it).

## 5. Decisions to confirm before L1

1. **Which month does a payment count for?** Proposed: the oldest unpaid billable month. Alternative:
   always the current month.
2. **Pay-per-class plans:** allow a link (for a single class or a class card) but never mark a month
   paid for them. Proposed: yes.
3. **Should L2 follow straight after L1,** or only once the gym has used L1 for a few weeks? Proposed:
   after.
