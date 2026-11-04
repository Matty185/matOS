# MatOS — User-Flow Audit (web gym management)

**Date:** 2026-11-02. **Scope:** `apps/web` gym-management flows only. Mobile app and Match Analysis/tagging are
parked and excluded. **Method:** read every page and API route under `apps/web/src/app`, plus what BJJ gym
software typically offers (vendor guides: Gymdesk, House of Grapplers, Zipper, GRADR, PushPress, Wodify,
GoCardless). Vendor claims are marketing, not verified.

**Ratings**

- ✅ **Good:** works end to end; no known friction.
- 🟡 **Needs polish:** works, but has real friction or edge cases.
- 🔴 **Broken / blocking:** a real gym will hit this in normal use, and there's no workaround in the app.
- ⚪ **Missing:** not built. Standard in BJJ gym software.

**Priority:** P0 = fix before/while the first real gym is live · P1 = core BJJ value, next · P2 = later / needs a decision.

---

## 1. Getting started & access

| #    | Flow                                         | Rating              | Notes                                                                                                                                                                                                                                                                  |
| ---- | -------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Operator creates a gym (provision script)    | ✅                  | CLI-only by design (no public gym signup).                                                                                                                                                                                                                             |
| 1.2  | Owner first login → setup wizard             | ✅                  | Rehearsed end to end (O6).                                                                                                                                                                                                                                             |
| 1.3  | Import roster (paste/CSV, starting belts)    | ✅                  |                                                                                                                                                                                                                                                                        |
| 1.4  | Add one member                               | ✅                  |                                                                                                                                                                                                                                                                        |
| 1.5  | Per-member invite (link/QR/WhatsApp)         | ✅                  |                                                                                                                                                                                                                                                                        |
| 1.6  | Bulk invite + printable QR sheet             | ✅                  | Safari print untested.                                                                                                                                                                                                                                                 |
| 1.7  | Self sign-up link (person fills own details) | 🟡                  | O7 built and reviewed; migration push + live test pending.                                                                                                                                                                                                             |
| 1.8  | Add coach / change role / make coach         | ✅                  |                                                                                                                                                                                                                                                                        |
| 1.9  | Forgot password                              | 🟡                  | Coach-issued link only (no email domain). Owners must contact the operator.                                                                                                                                                                                            |
| 1.10 | Change password, edit own contact details    | ✅                  |                                                                                                                                                                                                                                                                        |
| 1.11 | **Correct a member's email**                 | ✅ fixed 2026-11-02 | Email can't be edited anywhere: `editMemberSchema` omits it, and the account page has no email field. Since links let people sign in with whatever email is on the row, a typo becomes their permanent login. The only workaround (deactivate + re-add) loses history. |

## 2. Member lifecycle

| #   | Flow                                          | Rating              | Notes                                                                                                                                                            |
| --- | --------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Edit member (contact, plan, notes)            | ✅                  | Apart from email (1.11).                                                                                                                                         |
| 2.2 | Deactivate member                             | ✅                  |                                                                                                                                                                  |
| 2.3 | **Reactivate a returning member**             | ✅ fixed 2026-11-02 | No UI or API: the members route says "active via …/deactivate" only. A member back from injury or travel can't be restored; re-adding fails on the unique email. |
| 2.4 | Freeze / hold membership (injury, holiday)    | ✅ built 2026-11-03 | Common; affects payments (no overdue while frozen).                                                                                                              |
| 2.5 | Search / filter / show inactive               | ✅                  |                                                                                                                                                                  |
| 2.6 | Member photo                                  | ⚪ P2               | `photo_url` column exists, unused. Helps coaches learn names.                                                                                                    |
| 2.7 | GDPR: data export, deletion request → execute | ✅                  |                                                                                                                                                                  |

## 3. Classes & timetable

| #   | Flow                                                               | Rating                | Notes                                                                                                                                                                              |
| --- | ------------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Build a weekly timetable (multi-day add)                           | ✅                    |                                                                                                                                                                                    |
| 3.2 | **Cancel or move one session** (bank holiday, seminar, coach away) | ✅ built 2026-11-02   | Template model only. A cancelled class still shows as "upcoming" and accepts check-ins. A known CLAUDE.md simplification; a lightweight "exceptions" table would solve most of it. |
| 3.3 | Assign a coach to a class                                          | ✅ built 2026-11-03   | No instructor field. Needed for "who teaches what" and a coach's own view.                                                                                                         |
| 3.4 | Programs / levels (Kids, Fundamentals, Advanced)                   | ✅ built 2026-11-03   | `class_type` is gi / no-gi / comp / open mat only. Kids and fundamentals classes can only be told apart by name.                                                                   |
| 3.5 | Capacity                                                           | 🟡 P2                 | `max_capacity` is stored and shown to coaches, but not enforced or shown to athletes. Matters only if booking is added.                                                            |
| 3.6 | Athlete sees the week's timetable                                  | ✅ built 2026-11-03   | Home shows "upcoming" only; no full week view.                                                                                                                                     |
| 3.7 | Class booking / reservations                                       | ⏸ deferred 2026-11-04 | Most BJJ gyms are walk-in; low value unless capacity is tight.                                                                                                                     |

## 4. Attendance

| #   | Flow                                                | Rating              | Notes                                                                                                                                                                                                                     |
| --- | --------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Athlete self check-in (phone, 30 min before → end)  | ✅                  | Gym timezone aware (O1).                                                                                                                                                                                                  |
| 4.2 | Live attendance view                                | ✅                  | Realtime.                                                                                                                                                                                                                 |
| 4.3 | **Coach marks attendance**                          | ✅ fixed 2026-11-02 | Lists _every_ active member, staff included, with no search (painful at 80+ members). A wrong mark can't be undone. The date picker uses the browser's date, not the gym's. Past marks are stamped 12:00, not class time. |
| 4.4 | Front-desk kiosk / tablet check-in                  | ✅ built 2026-11-03 | Standard in BJJ software; members without phones (kids!) need it.                                                                                                                                                         |
| 4.5 | Attendance history per member                       | ✅                  | Calendar on the profile and athlete progress.                                                                                                                                                                             |
| 4.6 | Visitor / drop-in (guest from another gym, mat fee) | ⚪ P2               | Waiver + one-off payment record.                                                                                                                                                                                          |

## 5. Belts & progression

| #   | Flow                                                            | Rating                | Notes                                                                                                                                                                                  |
| --- | --------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | Promote belt / stripe (with celebration)                        | ✅                    |                                                                                                                                                                                        |
| 5.2 | Starting rank on import / sign-up                               | ✅                    |                                                                                                                                                                                        |
| 5.3 | **Promotion readiness** (classes and time since last promotion) | ✅ built 2026-11-02   | The single most BJJ-specific feature competitors lead with (attendance + time-in-rank criteria). All the data already exists; mostly a computed view plus a "ready for a stripe" list. |
| 5.4 | Grading day / bulk promotions                                   | ✅ built 2026-11-04   | Promote several people at once after a grading.                                                                                                                                        |
| 5.5 | Curriculum / technique tracking                                 | ⏸ deferred 2026-11-04 |                                                                                                                                                                                        |

## 6. Payments

| #   | Flow                                                       | Rating                           | Notes                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6.1 | **Monthly payment grid & overdue**                         | ✅ fixed 2026-11-02              | `billableMembers()` ignores `membership_plan` and role. Casual (pay-per-class) and comp-team members, and every coach, are flagged "Overdue" every month. Owners are excluded already (O6). False overdues erode trust in the dashboard quickly. |
| 6.2 | Record / waive a payment                                   | ✅                               | Amount optional; no default price per plan.                                                                                                                                                                                                      |
| 6.3 | Payments grid on a phone                                   | ✅ built 2026-11-03              | Six-month table scrolls sideways at 390 px (against the UI standard).                                                                                                                                                                            |
| 6.4 | Athlete sees own payment status                            | ✅ built 2026-11-03              | RLS already allows it (amount filtered); no athlete UI.                                                                                                                                                                                          |
| 6.5 | Payment reminders                                          | ✅ built 2026-11-04              | Needs an email domain or WhatsApp templating.                                                                                                                                                                                                    |
| 6.6 | Online billing / direct debit (Stripe / GoCardless / SEPA) | ⛔ stopped — scope/cost decision | The headline feature of every competitor. Payment processing is explicitly out of scope in CLAUDE.md; changing that is a product decision, not a fix.                                                                                            |
| 6.7 | Plans & prices configurable per gym                        | ⚪ P2                            | Plans are a fixed enum (monthly / casual / comp team).                                                                                                                                                                                           |
| 6.8 | Revenue summary                                            | ✅ built 2026-11-04              |                                                                                                                                                                                                                                                  |

## 7. Communication

| #   | Flow                                             | Rating                                      | Notes                                                                                                                        |
| --- | ------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 7.1 | Announcements (closures, seminars, gradings)     | ✅ built 2026-11-02                         | The `notifications` table exists but nothing renders it. Even an in-app banner on athlete Home would cover most of it.       |
| 7.2 | Message one member                               | 🟡                                          | Only via the invite/reset share dialogs (WhatsApp/email from the coach's phone). No general "contact" action on the profile. |
| 7.3 | Re-engage members not seen recently              | ✅ built 2026-11-04                         | The dashboard flags them; no one-tap "send a message" action.                                                                |
| 7.4 | Transactional email (invites, resets, reminders) | 🟡 code ready 2026-11-04, needs your domain | Blocked on verifying an email sending domain; this unblocks 1.9, 6.5 and 7.1 by email.                                       |

## 8. Families & kids

| #   | Flow                                                            | Rating                                                             | Notes                                                                                                                                                                    |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 8.1 | **Kids without their own email / siblings under one parent**    | ✅ fixed 2026-11-02 (roster-only members; parent accounts are 8.2) | `members.email` is required and unique per gym, so two siblings can't share a parent's email and a child can't be added without one. Deferred in the onboarding plan §5. |
| 8.2 | Parent account managing children (check-in, progress, payments) | ✅ built 2026-11-04                                                | Standard (Wodify, Zipper, PushPress).                                                                                                                                    |
| 8.3 | Family / sibling pricing                                        | ⚪ P2                                                              |                                                                                                                                                                          |

## 9. Sales, trials & waivers

| #   | Flow                                                            | Rating              | Notes                                                                                                    |
| --- | --------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------- |
| 9.1 | Free-trial booking / lead capture (e.g. from the gym's website) | ✅ built 2026-11-03 | Standard in competitors; the Northside website could feed it directly.                                   |
| 9.2 | Trial → member conversion tracking                              | ✅ built 2026-11-04 |                                                                                                          |
| 9.3 | Liability waiver / medical info at sign-up                      | ✅ built 2026-11-03 | Only GDPR consent today. Waivers (parent-signed for minors) are near-universal in martial arts software. |

## 10. Insights & admin

| #    | Flow                                                       | Rating                | Notes                                          |
| ---- | ---------------------------------------------------------- | --------------------- | ---------------------------------------------- |
| 10.1 | Dashboard stats, flags, recent activity                    | ✅                    |                                                |
| 10.2 | Audit log                                                  | ✅                    |                                                |
| 10.3 | AI assistant (read + confirmed writes)                     | ✅                    | Alpha scope.                                   |
| 10.4 | Reports (attendance trends, busiest classes, growth/churn) | ✅ built 2026-11-04   |                                                |
| 10.5 | Gym logo / branding                                        | ⚪ P2                 | Deferred in O-stages (needs a storage bucket). |
| 10.6 | Multiple locations                                         | ⏸ deferred 2026-11-04 |                                                |

---

## Proposed order

**P0 — fix while the first gym is live (small, high trust impact):** ✅ all done 2026-11-02 (see CLAUDE.md Decision Log).

1. Payments respect plan + role (6.1)
2. Reactivate member (2.3)
3. Edit a member's email (1.11)
4. Coach attendance marking: search, staff filter, undo, gym date, class time (4.3)
5. Kids / shared parent email (8.1) — only if the gym runs kids classes

**P1 — core BJJ value:**
promotion readiness (5.3) · cancel/move one session (3.2) · announcements (7.1) · kiosk check-in (4.4) ·
coach + program on classes (3.3, 3.4) · athlete week timetable (3.6) · athlete payment status (6.4) ·
freeze/hold (2.4) · waivers (9.3) · trial/lead capture (9.1) · parent accounts (8.2) · payments grid on a phone (6.3) ·
email domain (7.4).

**P2 / decisions:** online billing (6.6, a scope change) · configurable plans (6.7) · reminders (6.5) · reports (10.4) ·
grading-day bulk promotions (5.4) · drop-ins (4.6) · booking (3.7) · photos, logo, curriculum, multi-location.
