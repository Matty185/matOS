# MatOS Demo Walkthrough

A practical script for presenting MatOS live — to a technical collaborator first, then the gym coach as
first unpaid alpha tester. Demo gym: **Northside BJJ** (fictional, seeded via `scripts/seed.ts`).
Target length: **12–15 minutes**, expandable if the audience wants to dig into a specific area.

---

## Before you start

1. **Reseed for a clean run**, if it's been a while since the last one or previous testing touched the
   data: `npx tsx scripts/seed.ts` (wipes and reseeds Northside BJJ only — your own owner login is
   untouched, see below). Copy the coach and demo-athlete passwords it prints — they're freshly generated
   every run.
2. **Two browser windows** (one normal, one incognito/private) — lets you show the coach and athlete
   views side by side, which matters most for the live realtime attendance moment (§4 below).
3. Know your own owner login (`matijukm@gmail.com`) — the seed script never touches it.
4. If anything looks visibly wrong mid-demo (stale data, a state you don't want to explain), the fastest
   recovery is a re-seed — it's a ~30 second, fully idempotent reset.

### Demo accounts

| Role    | Email                                          | Password                                   | Notes                                           |
| ------- | ---------------------------------------------- | ------------------------------------------ | ----------------------------------------------- |
| Owner   | `matijukm@gmail.com`                           | _(your own — never changes)_               | Full access + Gym Settings                      |
| Coach   | `coach@northsidebjj.demo`                      | _(printed by the seed script — see below)_ | Day-to-day view — use this for most of the demo |
| Athlete | `demo.athlete@northsidebjj.demo` (Aoife Byrne) | _(printed by the seed script — see below)_ | Has real attendance/payment/belt history seeded |

Deliberately not filled in here: the coach/athlete passwords are real, working credentials against the
live deployed app, and this file is checked into git — anyone with repo read access shouldn't get a
standing login for free. Run `npx tsx scripts/seed.ts` right before you need them; it prints both,
freshly generated every time (and resets them if they were already set from a previous run).

App URL: `https://matos-pi.vercel.app`

---

## 1. Framing (30 seconds)

> "MatOS is a multi-tenant gym management platform for BJJ gyms, built around two things most gym
> software doesn't do: a natural-language assistant a coach can actually delegate busywork to, and a
> video-analysis feature that's honest about not storing your members' training footage. Everything
> you'll see is real — real database, real auth, real Postgres row-level security — running against a
> seeded demo gym."

## 2. Coach dashboard (1–2 min)

Log in as **coach**. Land on `/dashboard`.

- Point out the four live stat cards (active members, this week's class count, overdue payments,
  today's check-ins) — "these are computed live, not stored counters."
- Point out **Flags** — overdue members and anyone not seen in 30+ days. "This is the kind of thing a
  coach would otherwise have to notice manually."
- Point out **Recent activity** — plain-English, not a raw log. Mention the full **Audit Log** page
  (nav bar) exists for the complete filterable history — worth a quick click-through if there's time.

## 3. Members, belts, payments (2–3 min)

- `/members` — filter by belt or plan, point out kids' belts (grey/yellow/orange families) living in the
  same list as adult belts.
- Open a member profile (e.g. **Niamh Kelly**, a comp-team purple belt with a real promotion in her
  history) — show the Belt History tab's promotion timeline, then the Attendance and Payments tabs.
- `/payments` — the grid view, 6-month rolling window. Point out the 3 genuinely overdue members and the
  mix of paid/waived/unpaid. Click a cell to show the record/waive dialog.

## 4. Attendance — the realtime moment (2 min, needs both windows)

This is the best "wow" moment in the demo — worth setting up in advance.

1. Coach window: go to `/attendance`, select today (or whatever day has a class scheduled).
2. Athlete window (incognito): log in as the demo athlete, go to `/check-in`, and check in to that same
   class.
3. Switch back to the coach window **without refreshing** — the check-in appears live via Supabase
   Realtime.

> "No refresh, no polling — that's a live Postgres subscription."

## 5. The agentic interface (4–5 min — the main event)

Still as coach. Click the floating assistant button (bottom-right, any page).

Suggested query sequence — mix a read, a write with confirmation, and the deliberately-harder
deactivation flow to show the edge-case handling the plan specifically calls for:

1. **"Who's overdue?"** — read-only, answers immediately, no confirmation needed.
2. **"Mark Cian Doyle paid for this month."** — proposes the write, shows a confirmation card before
   anything happens. Confirm it, then optionally flip to `/payments` to show it actually landed, and to
   `/audit-log` to show the resulting entry (correctly attributed to the agent, with the raw query kept).
3. **"Promote Fionn Brennan to purple belt."** — same confirm-before-write pattern, this time on
   `members`.
4. **"Deactivate Darragh Walsh."** — the guarded path. Point out the assistant _won't_ let you just click
   Confirm — it requires literally typing "yes" or "confirm" first, specifically because this one's
   destructive. Worth explicitly narrating: "this is enforced server-side too, not just a UI gate."
   (Cancel it, rather than actually deactivating — you'll want Darragh back for the next demo run,
   though a reseed fixes it either way.)
5. **Something out of scope** — e.g. "What's the weather like?" — shows the graceful redirect rather than
   a confused answer, satisfying the plan's "edge cases and graceful error handling" success criterion.

## 6. Switch to the athlete portal (3 min)

Log out, log in as the **demo athlete** (or use the incognito window already logged in from §4).

- `/home` — attendance streak, belt display, upcoming classes.
- `/progress` — the three tabs: attendance history, belt history, personal logs.
- `/upload` — upload any small video file. Narrate explicitly: **"this is processed and immediately
  discarded — no video is ever written to storage, anywhere, at any point."** Show the mock technique
  report that comes back, and the past-analyses list (there are two pre-seeded ones to point to if you'd
  rather not wait for a live upload).
- `/account` — briefly show the data export link and the GDPR deletion-request flow (don't actually
  submit it unless you intend to walk through the owner-side execution too — it's a real, working flow,
  not a mockup, and reseeding is the only way back).

## 7. Wrap-up talking points (1 min)

- **What's real vs. stubbed:** everything except video analysis and payment processing is fully
  functional — auth, RLS, realtime, the agent, GDPR. Video analysis and payments are the two explicitly
  stubbed pieces, both by design (see CLAUDE.md's Out of Scope list), not because they didn't get built.
- **Multi-tenant from day one:** Northside BJJ is one gym in a schema that already enforces tenant
  isolation at the database layer (Postgres RLS) — a second gym is a data-seeding exercise, not an
  architecture change.
- **If asked "what's next":** per-session class instances (currently a recurring-template
  simplification, flagged throughout the codebase for the eventual refactor), real video analysis, actual
  payment processing, a staff/admin role, and the React Native app.

---

## If something goes wrong mid-demo

- **Wrong/stale data on screen:** `npx tsx scripts/seed.ts` — safe, idempotent, ~30 seconds, doesn't
  touch the owner login.
- **Agent seems slow/unresponsive:** it's a real Claude API call each time (Haiku 4.5, no streaming) —
  a few seconds of latency is normal, not a bug.
- **Rate limit warning appears:** the agent soft-warns at 40 queries/day and hard-blocks at 50 — very
  unlikely to hit mid-demo, but if it does, that's the intended behavior working correctly, not a bug —
  worth saying so out loud rather than looking alarmed.
