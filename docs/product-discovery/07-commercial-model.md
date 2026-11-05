# 07 — Commercial model

## 1. What exists today (verified in code)

| Element                                      | State                                                                                                                          | Evidence                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Multi-tenant architecture                    | ✅ Every tenant table keyed by `gym_id`, RLS isolation, one login across several gyms                                          | `supabase/migrations/20260726120000_account_primary_schema.sql` |
| MatOS's own pricing / subscriptions          | **None.** Every gym and user gets every feature, free.                                                                         | —                                                               |
| Entitlements model                           | 📐 Designed, unused: `entitlements(user_id, plan: solo                                                                         | gym, status: active                                             | trialing | canceled | expired, source: iap_apple | iap_google | stripe | manual, current_period_end)` with select-own RLS and no writer | same migration, section H |
| Feature gating / usage limits                | Only one operational limit: the coach assistant at 40 (warning) / 50 (block) queries per gym per day                           | `apps/web/src/app/api/agent/route.ts`                           |
| Trials of MatOS itself                       | None (the "free trial" feature is for the _gym's_ prospects)                                                                   | —                                                               |
| Self-serve gym sign-up / upgrade / downgrade | None — gyms are provisioned by the operator                                                                                    | `scripts/provision-gym.ts`                                      |
| Gyms collecting money from members           | Stripe Payment Links per plan, into the **gym's own** Stripe account; MatOS takes no cut and holds no money                    | `matos_payment_links_plan.md`, `matos_stripe_setup.md`          |
| Founder intent (documented)                  | "v1 launches free, full functionality… IAP for solo tier + gym billing off-store later. Model: recurring revenue, amounts TBD" | `matos_mobile_plan.md` §1                                       |

**Running costs that scale with usage** (from the integrations, not measured): Supabase and Vercel plans, Anthropic API calls per assistant query, Resend once email is on (free tier: 3,000 emails/month, 100/day per Resend's docs), Expo push (free tier), Apple/Google developer accounts once the app ships.

## 2. Possible pricing models (strategic suggestions, not existing functionality)

| Model                                                                                           | Fit with the architecture                                                  | Pros                                                                                                   | Cons                                                            |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **Per gym, flat monthly** (e.g. one price, all features)                                        | Trivial: one `entitlements` row per gym owner, or a `gyms.plan` column     | Simple to sell to small academies; matches Gymdesk's "all features every tier" message                 | Large gyms under-pay                                            |
| **Tiered by active members** (e.g. ≤50 / ≤150 / unlimited)                                      | Active member count is already computed for the dashboard                  | Fair; mirrors incumbents ($75–200 range reported)                                                      | Needs metering and upgrade prompts                              |
| **Free core + paid add-ons** (assistant, match analysis for the gym, kiosk, online payments L2) | Features are already modular routes and could be gated by role/entitlement | Low barrier; monetises the real differentiators                                                        | Gating work across web + mobile                                 |
| **Transaction fee on payments** (Stripe Connect application fee)                                | Needs option 2 (Connect), not built                                        | Revenue grows with the gym; no upfront fee (aligned with the founder's "fees from payments OK" stance) | Requires Connect onboarding, payouts, disputes, more compliance |
| **Athlete-side subscription** (solo analysis "Pro", via IAP)                                    | Entitlement sources already include `iap_apple` / `iap_google`             | Bottom-up revenue; independent of gyms                                                                 | App Store cut; competes with many cheap journal apps            |
| **Per location**                                                                                | Not possible yet: no locations                                             | —                                                                                                      | Needs a locations layer                                         |

A combination that fits the evidence, as a **hypothesis**: free for the first pilot gyms; then a flat or member-tiered gym subscription with integrated billing as the headline; an optional small platform fee on online payments; and a separate low-price athlete tier for analysis.

## 3. What would be needed before charging anyone

1. A custom domain and email (invites, receipts, password resets).
2. Self-serve gym sign-up (or a sales-led provisioning flow) and terms of service, a privacy policy and a DPA. MatOS is a processor of gyms' member data.
3. Billing for MatOS itself (Stripe Billing / Paddle), wired to `entitlements`.
4. Gating rules and a "plan" UI in Settings.
5. Error monitoring and backups policy (see `10-security-and-internationalisation.md`).
