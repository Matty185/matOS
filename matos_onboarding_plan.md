# MatOS — Real-Gym Onboarding Plan (web, gym management only)

Status: **built O1–O6, 2026-11-01** (see CLAUDE.md Decision Log entries "Stages O1–O5" and "Stage O6"; logo upload deferred). Scope: the coach/owner web app only. Mobile app and the Match Analysis
tagging tool are explicitly untouched. Same staged-with-explicit-go-ahead discipline and ECC gates as
every prior plan; where this conflicts with `matos_project_plan.md` for onboarding/settings scope, this
plan wins.

## 1. The scenario

You sit down with the head coach tomorrow with a laptop. In ~20 minutes he should leave with: his own
owner login, his gym's details and timetable in, his assistant coaches invited, his roster imported with
correct belts, and members starting to join — without you touching SQL, and without anything he enters
being visible to anyone outside his gym.

## 2. What actually happens today (audit, 2026-10-30)

| Step               | Today                                                                                                                                                                                                                                                                                             | Severity                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Create the gym     | **Impossible from the app.** `/signup` only creates a personal workspace; real `kind='gym'` rows exist only via `scripts/seed.ts` (hard-coded to Northside).                                                                                                                                      | Blocker                              |
| Owner account      | No path to an owner login for a new gym.                                                                                                                                                                                                                                                          | Blocker                              |
| Invite emails      | Sent from `onboarding@resend.dev` (Resend sandbox), which only delivers to the Resend account owner's own address. **Every real member invite would silently not arrive** (the API returns success-from-Resend's-side failures as `inviteSent: false`, but the coach has no alternative channel). | Blocker                              |
| Add coaches        | Not possible. `POST /api/members` hard-codes `role: 'athlete'`; Settings is an empty placeholder.                                                                                                                                                                                                 | Blocker                              |
| Existing belts     | Create form has no belt/stripes/join date. Every imported member lands as white belt, joined today. Fixing it via Promote writes a fake `belt_history` "promotion" (and fires the celebration) — pollutes history and Progress.                                                                   | High                                 |
| Roster entry       | One member at a time, 9-field form. A 60-member gym = ~60 form submissions.                                                                                                                                                                                                                       | High                                 |
| Forgot password    | No reset link on `/login`. First forgotten password = coach has to call you.                                                                                                                                                                                                                      | High                                 |
| Gym details        | Name/address/email/logo not editable anywhere.                                                                                                                                                                                                                                                    | Medium                               |
| First-run guidance | Dashboard shows zeros and an empty activity feed; no "what next".                                                                                                                                                                                                                                 | Medium                               |
| Invite tracking    | Status only visible per-member on their profile; no roster-level view or bulk resend.                                                                                                                                                                                                             | Medium                               |
| Timezone           | Check-in window uses server time (Vercel = UTC). Correct for Ireland/UK in winter, **off by 1h from the last Sunday of March**, wrong all year elsewhere.                                                                                                                                         | Medium (time-bomb)                   |
| Membership plans   | Fixed enum `monthly / casual / comp_team`, no prices. A real gym likely has kids/family/student/10-class.                                                                                                                                                                                         | Low for day 1                        |
| Shared kids' email | `unique (gym_id, email)` blocks two siblings sharing a parent's email.                                                                                                                                                                                                                            | Low for day 1, will hit kids classes |

## 3. Target experience

### 3.1 Gym provisioning (you, 1 minute, before the meeting)

`npx tsx scripts/provision-gym.ts --name "Republic BJJ" --owner-email coach@… --owner-first … --owner-last …`

Creates the `gyms` row (`kind='gym'`), the owner's `members` row (`role='gym_owner'`), and an owner invite
via the existing, already-reviewed `createAndSendInvite` token machinery — then **prints the claim URL**
(and emails it if the domain is verified). No new public surface: the coach claims through the existing
`/invite/[token]` flow (which already handles "new account" vs "existing account, prove ownership").

Why not a public "Create a gym" signup: an open self-serve gym-creation endpoint is a spam/abuse surface
the alpha doesn't need — you are onboarding one gym by hand. Self-serve gym creation is a later stage once
there's billing. (Option B in §6 if you'd rather have it now.)

### 3.2 First login → setup wizard (coach, ~10 minutes, on the laptop)

Claiming the owner invite lands on `/setup` (only reachable by a `gym_owner` whose gym has
`onboarding_completed_at is null`; skippable at any step, resumable, every step also reachable later from
Settings). Progress bar across the top, one decision per screen, 44px targets, 390px-safe.

1. **Your gym** — name (prefilled), address, contact email, timezone (prefilled from the browser's
   `Intl` zone), logo upload (Supabase Storage, photos-only bucket — allowed per CLAUDE.md).
2. **Timetable** — weekly grid. Quick-add rows ("Mon/Wed/Fri 19:00 Gi 60 min") plus a "copy this class to
   other days" multi-select. Reuses `POST /api/classes`.
3. **Your coaches** — name + email per coach, sent as **coach** invites. Optional; "I'll do this later".
4. **Your members** — three ways in, same preview table:
   - **Paste a list** (from WhatsApp/Notes/Sheets): one per line, `Name, email, belt, stripes` — loose
     parsing, belts accept "purple", "Purple belt", "P", kids belts by name.
   - **Upload CSV** (with a downloadable template).
   - **Add one** (the existing form, now with belt/stripes/join date/plan).
     Preview table shows each parsed row with inline validation (bad email, duplicate in file, already in
     gym) and lets him fix cells before importing. Nothing is written until **Import N members**.
5. **Invite them** — "Send invites now" (email) / "I'll share links myself" (copy link, QR, WhatsApp share
   per member, or a printable sheet) / "Later". Explains in one line what members will receive.
6. **Done** — summary ("3 classes, 2 coaches invited, 47 members imported, 47 invites sent") and the
   three things to do next: try the agent, open Attendance during tonight's class, check Payments.

### 3.3 Ongoing (after day 1)

- **Dashboard setup checklist** card while onboarding isn't complete (gym details ✓, timetable ✓, coaches,
  members, ≥50% members joined) — dismissible, disappears automatically when done.
- **Members list**: invite-status column + filter (Not invited / Invited / Expired / Joined), multi-select
  **"Send invites"** / **"Resend expired"**, and per-row **Copy invite link**.
- **Add member** form gains belt, stripes, join date. Initial rank is stored on the member row and written
  as a single `belt_history` row flagged as initial (not a promotion — no celebration, not counted as a
  promotion anywhere).
- **Settings (owner)** stops being a placeholder:
  - _Gym_ — details, logo, timezone.
  - _Team_ — coaches list with role, invite status; invite coach; demote coach→athlete; deactivate.
    Owner cannot demote themselves (last-owner guard in DB).
  - _Membership plans_ — deferred (see §5), shown as read-only list for now.
  - _Data & privacy_ — the existing GDPR section.
- **Login**: "Forgot password?" → reset email → `/reset-password`.

### 3.4 Security for a real gym's data

- Real gym is a separate `gyms` row; RLS already isolates it from Northside and every test gym — verify
  live with the coach's real session before he enters data (read every tenant table, expect only his gym).
- Coach role grants: invites issued with `role='coach'` only by an owner (DB trigger, not app check —
  extends the Stage 1 role-escalation trigger rather than bypassing it). Coaches cannot invite coaches.
- Import route: owner/coach only, Zod-validated per row, max rows per request (e.g. 300), single
  transaction (all-or-nothing), audit-logged as one `members.imported` entry with count (not PII dump).
- Invite links handed out manually carry the same 7-day expiry, single use, attempt-counting as email ones.
  Copy-link generates a fresh token (old ones invalidated) — the raw token is never stored, so "copy" must
  mint, not retrieve; UI says so.
- Password reset: Supabase Auth `resetPasswordForEmail` with redirect allowlisted to the prod URL only;
  generic "if that email exists…" response (no enumeration). Requires custom SMTP in Supabase (see §4).
- Owner account hygiene checklist for the meeting: strong unique password, leaked-password protection on
  (Supabase Auth setting), sign out the laptop session if it's yours.
- 2FA stays out of scope (CLAUDE.md) — noted as the next security item once real gyms are live.
- Tear-down/demo separation: Northside demo data untouched; the agent's rate limit applies per gym as-is.

## 4. Things only you can do (not code)

1. **Verify a sending domain in Resend** (DNS records on a domain you own) and set `FROM_ADDRESS` to it.
   Without this, emails to anyone but you don't arrive — the copy-link/QR path (§3.2 step 5) is the
   fallback that makes tomorrow work regardless.
2. **Point Supabase Auth's SMTP at Resend** (dashboard → Auth → SMTP) so password-reset emails come from
   the same domain and aren't capped at Supabase's default ~2/hour.
3. Set Supabase Auth **Site URL / redirect allowlist** to the production domain.
4. Turn on **leaked password protection** (Supabase Auth → Passwords).
5. Get the coach's real gym name, address, timetable and roster export (even a WhatsApp group member
   list) before you go.

## 5. Explicitly not in this plan

Payment processing, configurable membership plans with prices (needs an enum→table migration and touches
Payments/agent — worth its own stage), sibling/shared-email accounts (needs a guardian model), kiosk/QR
self check-in, notification emails beyond invites + password reset, 2FA, mobile changes, tagging changes,
public self-serve gym creation.

## 6. Build sequence

| Stage | Contents                                                                                                                                                                                                                                                 | Gate                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| O1    | Migration: `gyms.timezone`, `gyms.onboarding_completed_at`; `invites.role` (athlete/coach) + trigger so only owners mint coach invites; claim route honours invite role; initial-rank `belt_history` flag; last-owner guard. Check-in uses gym timezone. | security + database **BLOCKING** |
| O2    | `scripts/provision-gym.ts`; Resend `FROM_ADDRESS` from env; copy-invite-link endpoint/UI; forgot/reset password.                                                                                                                                         | security + code                  |
| O3    | Member create with belt/stripes/join date; bulk import API (paste + CSV, preview, transactional).                                                                                                                                                        | security + code                  |
| O4    | `/setup` wizard (6 steps), dashboard checklist, members-list invite status + bulk invite.                                                                                                                                                                | code + UX                        |
| O5    | Settings: Gym, Team (coach invite/demote/deactivate), logo upload.                                                                                                                                                                                       | security + code + UX             |
| O6    | Dress rehearsal: provision a throwaway gym end-to-end in prod as if you were the coach (incl. a member claiming on a phone), RLS isolation check, then delete-by-deactivation.                                                                           | full pass                        |

Day-1 minimum if time is short: **O1 + O2 + O3** (gym exists, coach logs in, roster imported with correct
belts, links shareable even without a verified domain). O4/O5 make it feel polished.
