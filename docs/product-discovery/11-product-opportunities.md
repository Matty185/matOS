# 11 — Product opportunities

Suggestions only. Nothing here is implemented. Complexity is a rough estimate given this codebase.

## 1. Immediate (days)

| #   | Problem                                                                                      | User             | Proposal                                                                                                              | Business value                                                                    | Complexity             |
| --- | -------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------- |
| I1  | Belts render without colour on web and mobile                                                | Everyone         | Add `packages/shared/src/**/*` to both Tailwind `content` arrays                                                      | The most BJJ-identifying element works again; needed before any marketing capture | Low                    |
| I2  | No logo; mobile uses Expo's template icon                                                    | Brand, App Store | Commission a mark, app icon, favicon, social avatar                                                                   | Credibility, store approval                                                       | Low–medium (design)    |
| I3  | Red badges mean three different things on the members list                                   | Coach            | Separate status colours (money / account / compliance)                                                                | Faster scanning, calmer UI                                                        | Low                    |
| I4  | Assistant panel repeats its intro; activity feed fills with "asked the assistant a question" | Owner            | Remove the duplicate; collapse or filter assistant entries in the feed                                                | Polish                                                                            | Low                    |
| I5  | Marketing screenshots look like test data                                                    | Founder          | A curated demo gym (realistic names, a few months of attendance, belts, analysis) used only for screenshots and demos | Better website, App Store, investor decks                                         | Low–medium             |
| I6  | A custom domain doesn't exist                                                                | Founder, gyms    | Buy a domain; turn on the email that's already built                                                                  | Invites and resets by email, professional sender, unlocks charging                | Low (cost ≈ €10–15/yr) |

## 2. Near term (weeks)

| #   | Problem                                                        | User     | Proposal                                                                                 | Value                                                               | Complexity            |
| --- | -------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------- |
| N1  | Payments are recorded by hand                                  | Owner    | Stage L2: Stripe webhook marks months paid automatically (`matos_payment_links_plan.md`) | Removes the biggest weekly admin task                               | Medium                |
| N2  | Recurring billing is the market's headline feature             | Owner    | Stripe Connect or GoCardless subscriptions per plan, freezes pause billing               | Removes the #1 switching objection; enables a payments revenue line | High                  |
| N3  | Every new gym needs the founder                                | Growth   | Self-serve gym sign-up with a guided trial                                               | Scalable acquisition                                                | Medium                |
| N4  | Prospects get no reply                                         | Owner    | Automatic email/SMS confirmation to trial requests, plus a reminder to the coach         | Conversion                                                          | Low–medium (after I6) |
| N5  | Coaches want a list of "my classes" and a phone-first mat mode | Coach    | Filter by assigned coach; a compact "tonight" view                                       | Daily habit for staff                                               | Low–medium            |
| N6  | Athletes don't know if there's room                            | Athlete  | Show live headcount on the timetable; optional "I'm coming" (soft booking)               | Engagement; data for capacity planning                              | Medium                |
| N7  | Mobile app lags behind web                                     | Athlete  | Parity pass, then TestFlight / Play internal testing                                     | App Store presence, push                                            | Medium                |
| N8  | No notification centre                                         | Everyone | Render the existing `notifications` table (promotions, announcements, payment due)       | Engagement                                                          | Medium                |

## 3. Longer term (months)

| #   | Opportunity                                 | User             | Proposal                                                                                                              | Value                                               | Complexity  |
| --- | ------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------- |
| L1  | Athlete ↔ gym performance loop              | Athlete, coach   | Coaches see each athlete's match profile trends next to attendance and promotion readiness ("data-informed gradings") | Unique positioning                                  | Medium      |
| L2  | AI-assisted tagging (phase 2, designed for) | Athlete, coach   | Suggested events from video, processed and discarded                                                                  | Big differentiator; needs a privacy and cost review | High        |
| L3  | Curriculum & technique library              | Coach            | Syllabus per belt, linked to classes and promotions                                                                   | Matches incumbents (Gymdesk, Kicksite)              | Medium      |
| L4  | Multi-location & organisations              | Owner, franchise | Locations, per-location staff and reports, an organisation level                                                      | Opens larger customers                              | High        |
| L5  | Retention intelligence                      | Owner            | At-risk alerts (attendance drop + overdue), automated "missed you" messages                                           | Revenue retention                                   | Medium      |
| L6  | Competition features                        | Athlete, coach   | Competition calendar, team registration, results to profile                                                           | Community, PR                                       | Medium      |
| L7  | Integrations                                | Owner            | Calendar feeds, Instagram share, accounting export (Xero/QuickBooks), Smoothcomp results                              | Fewer tools for the gym                             | Medium      |
| L8  | Internationalisation                        | Growth           | Translations, currencies, phone defaults, tax                                                                         | New markets                                         | Medium–high |

## 4. Differentiators to invest in (summary)

1. **The assistant**: run the gym by asking questions, with every write confirmed and audited.
2. **Gym + athlete analytics in one product** (management data and match analysis share the athlete).
3. **BJJ-native progression**: readiness rules, grading day, kids belts, parent accounts.
4. **Free to start, fees only from payments**: aligned with small academies' cash flow.
