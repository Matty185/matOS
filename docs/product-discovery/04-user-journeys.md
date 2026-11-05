# 04 — User journeys (as they work today)

Documented from the code and the end-to-end rehearsal of 2026-11-01 (`CLAUDE.md` → "Stage O6"). Friction points are marked ⚠.

## Gym owner

1. **Account creation.** There is no public gym sign-up. The founder runs `npm run provision-gym -- --name … --owner-email … --app-url …`, which prints a one-time claim link (valid 7 days). ⚠ Every new gym needs the founder; fine for pilots, blocks self-serve growth.
2. **Claim.** Owner opens the link, sets a password, consents to data storage, lands in the **setup wizard**.
3. **Setup wizard** (`/setup`): Your gym (name, address, contact email, timezone) → Timetable (weekly classes) → Coaches (add; gets an owner-minted link) → Members (paste/upload roster with belts, stripes, join dates, plans) → Invites (per-person links, bulk QR sheet to print) → Done (summary, "good next things to try").
4. **Configure** (Settings): plans & prices + Stripe links, sibling discount, visitor fee, waiver, promotion rules, free-trial link + QR, kiosk tablet, logo.
5. **Run the gym**: dashboard flags → Payments grid (mark paid, waive, freeze), Promotions (ready list, grading day), Attendance (live), Announcements, Trials, Visitors, Reports, assistant.

- ⚠ **No email**: every invite, reset and reminder is a link the coach must send by WhatsApp/SMS or show as a QR. Works, but it's manual.
- ⚠ **Payments are recorded, not collected**: online payment is a Stripe link; the coach still marks the month paid.
- ⚠ **Owner forgets password** → only the operator can issue a reset.

## Coach

1. Receives a link from the owner → sets password → coach dashboard ("You're teaching today" if assigned to classes).
2. **Attendance**: pick date → expand class → see who's in (live), search and mark present, remove mistakes, see visitors and capacity.
3. **Members**: profile → message, promote, record paper waiver / parent signs on the coach's device, password reset link for an athlete, holds, notes.
4. **Promotions**: Ready / Close lists computed from attendance; promote individually or on grading day.

- ⚠ Coaches can't see "their" classes as a list. Assignment is shown, not filtered.
- ⚠ No mobile coach app; the web works on a phone (all screens are 390px-tested).

## Athlete

1. **Joining**, one of three ways:
   - (a) a personal invite link or QR from the coach (pre-filled record);
   - (b) a one-time sign-up link, where they fill in their own details and belt;
   - (c) as a kid, the parent's account is linked instead.

   If the email already has a MatOS account, they enter that password.

2. **Home**: waiver prompt, announcements, attendance streak, membership card (6 months; Pay online button if the plan has a link), upcoming classes.
3. **Check in** (from 30 minutes before class until the end): tap Check In, or tap their name on the gym tablet. Full classes refuse self check-in.
4. **Progress**: attendance calendar, belt history ("classes since last promotion"), own training logs.
5. **Timetable**: next 7 days with cancellations and moves, and programme filter.
6. **Analysis** (optional): log a match, tag the video locally, see the computed profile, share a card.

- ⚠ The web athlete experience is richer than the mobile app (which is parked and missing timetable, membership, waivers, announcements).
- ⚠ No booking, so "is there room?" is only answered at check-in time.

## Parent

Coach adds a parent on the child's profile → parent gets an invite → lands on **Family**: each child's belt, recent attendance, today's classes with Check in, waiver to sign, membership card.

## Prospect (free trial)

Owner turns on the trial link → shares it (website, Instagram) → visitor picks a class/date and leaves contact details (parent can request for a child) → coach follows up from **Trials** (contacted → booked → attended) → "Add as member" pre-fills the member form → request marked Joined. ⚠ No automatic email/SMS reply to the prospect; the gym follows up by hand.

## Visitor / drop-in

Coach opens **Visitors** → Add visitor (class, name, home gym, belt, mat fee, waiver typed on the coach's device or on paper) → appears on Attendance and counts toward capacity.

## Solo athlete (no gym)

Sign up → personal workspace → match analysis + share cards → if their coach later invites the same email, the gym attaches to the same login and the personal workspace stays.

## Duplications and complexity observed

- Three ways to get a member onto the system (pre-filled invite, bulk QR sheet, self sign-up link) + import. Powerful, but the choice needs explaining to a new owner.
- Two "plan" concepts under the hood (billing type vs the gym's named plan). Hidden well in the UI.
- Members' payment status appears in four places (members list, profile tab, payments grid, dashboard). They're consistent, but there's no single "money" home.
