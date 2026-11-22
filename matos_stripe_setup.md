# Taking payments online with Stripe (for gym owners)

MatOS can show your members a **Pay online** button that opens a Stripe payment page for their plan.
The money goes straight into **your own Stripe account**. MatOS never sees card details and never holds
your money.

**Cost.** Stripe has no setup or monthly fee. It takes a fee from each payment, roughly 1.5% + €0.25
for a European card. Check Stripe's current Irish pricing at stripe.com/ie/pricing.

## 1. Open a Stripe account (once)

1. Sign up at stripe.com with the gym's details and bank account for payouts.
2. Stripe asks for identity and business details before it pays money out. This is Stripe's
   requirement, not MatOS's.
3. To try it first without real money, use **Test mode**, the switch at the top of the Stripe
   dashboard.

## 2. Make a payment link for each plan

For each plan you want members to pay online (for example "Adults monthly"):

1. In Stripe, go to **Payment Links**, then **New**.
2. Add a product, for example "Adults monthly", with a **one-time** price, for example €60.
   Members pay each month from the button. Recurring subscriptions aren't supported yet.
3. Under **After payment**, you can choose "Don't show confirmation page" and redirect to your MatOS
   address, so members land back in the app.
4. Optional: tick **Allow promotion codes** or **Adjustable quantity** if you need them.
5. **Create link**, then copy it. It looks like `https://buy.stripe.com/…`. In test mode it looks
   like `https://buy.stripe.com/test_…`.

For pay-per-class plans you can make a link for a single class or a class card. Members on that plan
get a "Pay for a class online" button.

## 3. Add it in MatOS

**Settings → Membership plans → Edit** the plan, paste the link into **Stripe payment link**, and save.
MatOS only accepts real Stripe payment links. Every change is recorded in the audit log.

Members on that plan now see the button on their Membership card on Home. Parents see it on each
child's card on Family. On monthly plans the button ("Pay November online") only shows when
something is unpaid, and it's for the oldest unpaid month first. Pay-per-class members always see
"Pay for a class online". A test-mode link is labelled "(test)" on the button.

## 4. When someone pays

- You get the payment in Stripe (dashboard or the Stripe app, with an email notification if you turn
  it on).
- Each payment shows a **reference** such as `Ana-Murphy_2026-11_3f2a9c1b`: the member's name, the
  month and a short id. In the Stripe dashboard it's on the payment's details, as "Client reference
  ID" on the Checkout session.
- In MatOS, mark that month paid as usual (Payments, or the member's profile). The plan price is
  already filled in. Or set up automatic marking (section 5) and skip this step.

## 5. Optional: mark months paid automatically

Stripe can tell MatOS when a member pays, so the month is marked paid without you doing anything.
Set it up once, on a computer:

1. In MatOS, go to **Settings → Automatic online payments → Set up automatic payments**. MatOS shows
   a webhook address. Copy it.
2. In Stripe, go to **Developers → Webhooks → Add endpoint** (in newer dashboards: **Workbench →
   Webhooks → Add destination**, "Your account"). Paste the address.
3. Choose these three events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
4. Save. Open the endpoint, reveal its **Signing secret** (it starts with `whsec_`) and paste it into
   MatOS. MatOS stores it encrypted and never shows it again.

**Plans need a price.** MatOS only marks a month paid when the amount is at least the member's plan
price (with any sibling discount). If a plan has no price, payments on it go to "needs a look"
instead, because MatOS can't tell whether someone paid through a cheaper link.

**Trying it first.** Test mode and live mode have separate webhooks and separate secrets. Add the
address in test mode, paste the test secret, and pay with a test link and test card. The payment
shows under **Online payments → Recent** as a test payment. Test payments never mark a month paid.
When it works, add the same address in Stripe's live mode and use **Replace signing secret** in
MatOS with the live one.

**Members can change the reference.** The reference is part of the payment link, so someone could
edit it to pay for another member or month. That only ever pays a debt (never less than the plan
price), but if a payment lands on the wrong person, fix it by hand.

**What happens then**

- When a member pays for a month, it shows **Paid online** in Payments and on their profile.
- Bank payments such as SEPA take a few days. MatOS waits until Stripe confirms them.
- A pay-per-class payment is listed, but there's no month to mark.
- Anything unusual goes on the Payments page under **Online payments → needs a look**, with a count on
  the dashboard: someone paid for a month that was already paid, a bank payment failed, MatOS
  couldn't tell who paid, or they paid less than their plan price. Sort it out (refund in Stripe, or
  mark the right month by hand), then press **Mark as checked**.
- Refunds aren't sent to MatOS. If you refund a payment, mark the month unpaid by hand.

To stop, use **Disconnect** in Settings and delete the webhook in Stripe.

## What Stripe receives from MatOS

The button sends the member's name, the month and a short id (the reference), and the member's email
so Stripe can pre-fill it. For a child it's the child's name. This goes only to your own Stripe
account, because your member is paying you. Stripe is then a processor of your gym's payment data, so
mention it in your privacy notice.

## 5. Refunds and disputes

Handle these in Stripe. If you refund a month, change that month back to unpaid or waived in MatOS.

## Turning it off

Clear the link on the plan and save. The button disappears straight away. You can also deactivate the
link in Stripe.
