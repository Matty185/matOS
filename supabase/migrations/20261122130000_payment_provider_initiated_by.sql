-- Stage L2 (matos_payment_links_plan.md): audit rows written when Stripe
-- reports a payment have no human actor. Own file: an enum value can't be
-- added and used in the same transaction.

alter type public.initiated_by add value if not exists 'payment_provider';
