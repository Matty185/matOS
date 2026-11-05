# 01 — Executive overview

_Audit of the MatOS repository and running product, 2026-11-05. Read-only: the only side effects were screenshots and local test servers._

## What MatOS is today

MatOS is a **multi-tenant management platform for Brazilian Jiu-Jitsu academies**: a web app (Next.js, Supabase, Vercel) where owners and coaches run members, classes, attendance, belts, payments tracking, waivers, prospects and reports, plus an athlete-facing side (on the web, and in a parked Expo mobile app). It also contains a **match analysis module**: athletes and coaches tag positions and events on locally played video, and the system computes performance profiles. Video is never uploaded.

It is an **alpha in real use by one unpaid pilot gym** (Northside BJJ, Ireland). It is free, has no billing for MatOS itself, and is provisioned by the founder.

## Who it serves

- **Primary:** independent BJJ academies with roughly 20–150 members and a few coaches (owner = head coach).
- **Secondary:** their athletes and kids' parents.
- **Emerging:** solo athletes who want match analysis without a gym.

Not served yet: multi-location academies, franchises, non-BJJ martial arts.

## What's implemented (headline)

- **Onboarding:**
  - operator provisioning, a 6-step setup wizard, roster import with real belts;
  - invite links and QR sheets, self-serve sign-up links.
- **Daily operations:**
  - dashboard with flags;
  - live attendance; self, kiosk-tablet and parent check-in;
  - capacity limits;
  - session cancellations and moves;
  - announcements;
  - drop-in visitors.
- **BJJ progression:**
  - adult and kids belts with stripes;
  - promotion readiness rules;
  - grading day;
  - belt history.
- **Money (tracking, not collecting):**
  - per-gym plans and prices, sibling discount, holds/freezes;
  - a six-month payments grid, overdue flags;
  - athlete membership status;
  - Stripe Payment Links into the gym's own account.
- **Compliance:**
  - versioned liability waivers;
  - full GDPR (consent, export, erasure);
  - immutable audit log;
  - RLS-enforced tenant isolation.
- **Growth:**
  - public free-trial request link and pipeline;
  - one-tap WhatsApp/SMS/email messages.
- **Insight:**
  - reports (attendance trends, busiest classes, joins and leaves, payments, trial funnel);
  - a **natural-language assistant** (Claude) that answers questions and proposes changes behind a confirmation.
- **Athletes:**
  - home, week timetable, check-in, progress, waiver signing, membership status, match analysis, share cards (mobile).

Full catalogue: `02-feature-inventory.md`.

## What makes it potentially valuable

1. **BJJ-native workflows**: readiness rules, grading day, kids belt families, parent accounts, open mats, drop-ins.
2. **An assistant that runs the gym by conversation**, safely (server-injected tenant, confirmations, audit). Not found in the competitors researched.
3. **Gym management and athlete performance analysis on one athlete record**: competitors split these between management suites and journal apps.
4. **Free to start, with online payments through the gym's own Stripe**: no upfront fees.
5. **Unusually rigorous engineering for an alpha**: RLS everywhere, a reviewed Decision Log for every stage, GDPR built in.

## Biggest gaps

- **No integrated recurring billing.** This is the headline feature of every competitor.
- **No email:** there's no domain, so invites, resets and reminders are links the coach sends by hand.
- **No brand:** no logo or app icon, and generic shadcn styling. **Belt colours are currently broken** on both platforms (a one-line config defect found in this audit).
- **No self-serve gym sign-up, no pricing, no MatOS billing.**
- **The mobile app is parked:** never shipped, missing several web features, uses a placeholder icon and emoji navigation.
- **No tests, CI, monitoring or staging environment.**
- **Ireland/English/euro-first:** no translations or multi-currency; no multi-location support.

## Maturity at a glance

| Dimension               | Rating                   | Why                                                                |
| ----------------------- | ------------------------ | ------------------------------------------------------------------ |
| Core gym features       | Good                     | Broad and verified with a real pilot                               |
| Security & privacy      | Good for alpha           | Layered RLS, audits, GDPR; accepted risks documented               |
| Reliability engineering | Low                      | No tests, CI or monitoring; dev runs against production            |
| Commercial readiness    | Low                      | No pricing, billing, self-serve sign-up, domain or legal documents |
| Brand                   | Very low                 | Wordmark only                                                      |
| Mobile                  | Medium code, not shipped | Built to store-prep, parked                                        |

See `README.md` for the document map.
