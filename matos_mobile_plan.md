# MatOS — Mobile App & Solo Athlete Platform: Project Plan

**Version:** 1.0
**Status:** Ready for execution via Claude Code
**Prerequisite:** MatOS web complete (alpha + analysis module + tagging UX redesign)
**Companion:** "MatOS Mobile" section for the Obsidian agent vault (separate file)
**Methodology:** unchanged — staged build, ECC gates, security-reviewer + database-reviewer BLOCKING on all schema/RLS changes.

---

## 1. What This Actually Is

Two projects executed as one plan, in dependency order:

**Project A — Solo Athlete Platform (architecture).** MatOS becomes account-primary: a person can sign up with no gym, no invite, no coach, and get a **personal workspace** where the match analysis module works fully. Gym membership becomes an optional attachment to an account, not the container of it. This touches auth, schema, RLS, and onboarding — it is the hard part and it lands on the **web codebase first**, because mobile consumes it.

**Project B — Mobile App (Expo React Native).** Athlete-focused iOS + Android app: solo signup, gym-member experience, the analysis module with a **native fullscreen tagging player** (the headline — RN owns the screen, so the fullscreen fights from web disappear), in-app recording, push notifications, share cards, offline tolerance. Coach experience stays on web for v1.

### Locked product decisions

| Decision                                   | Choice                                                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Account model                              | Account primary; gym membership optional, attachable, detachable                                                                                                                                             |
| Solo workspace                             | Personal workspace pattern (gym-of-one internally) — existing RLS logic pattern preserved                                                                                                                    |
| Merge flow                                 | Coach invites an email that already has an account → user accepts in-app → membership attaches; personal workspace persists alongside                                                                        |
| Breakdown privacy                          | Personal-workspace breakdowns: **private by default, shareable to gym** (rule survives merge). Gym-context breakdowns: coach-sees-all, unchanged                                                             |
| Solo user sees gym features                | Teasers ("your gym isn't on MatOS — invite your coach") — deliberate growth mechanic                                                                                                                         |
| Agent                                      | Coach-only, web-only. Solo users get clear UI instead — no agent, no per-user API cost                                                                                                                       |
| Coach on mobile                            | Not in v1. Web remains the coach product. (Full owner-side mobile: future plan)                                                                                                                              |
| Social scope v1                            | **Share cards/links only** (profile card + breakdown), opponent name **redacted by default** on anything public. Friends/posts/feeds explicitly deferred to their own future plan                            |
| Payments                                   | v1 launches **free, full functionality** (test users need everything). Entitlements concept designed into schema now; IAP for solo tier + gym billing off-store later. Model: recurring revenue, amounts TBD |
| Marketing target                           | App Store presence + IG/TikTok demo clips; share cards feed this loop                                                                                                                                        |
| Deadline                                   | None — ship when gates pass                                                                                                                                                                                  |
| Apple dev account (individual vs business) | Deferred — decide by Stage M9 (TestFlight)                                                                                                                                                                   |

---

## 2. Architecture — Solo Platform (Project A)

### 2.1 Monorepo restructure (confirmed)

```
matos/
  apps/
    web/        ← current Next.js app, moved
    mobile/     ← new Expo app
  packages/
    shared/     ← types, Zod schemas, event taxonomy types,
                  metric computation, Supabase client factory,
                  date/format utils
```

npm workspaces. Nothing in `packages/shared` may import React DOM or React Native — logic and types only. Metric computation moves here so web and mobile compute identical profiles.

### 2.2 Account-primary data model

New/changed:

- **workspaces** (or reuse gyms with `kind: gym | personal`) — every solo signup auto-creates a personal workspace. Recommended: extend `gyms` with `kind` to preserve every existing gym_id-scoped RLS policy untouched; personal workspaces are gyms of one with owner = the user.
- **memberships** `(user_id, gym_id, role, joined_at, active)` — replaces the implicit one-gym-per-user assumption. A user has exactly one personal workspace membership + zero or more gym memberships.
- **members** rows remain per-gym athlete records; a user with a gym membership has a member row there; their personal workspace has its own implicit member context.
- **breakdowns** gain `visibility (private | gym)` — default `private` in personal workspaces, default `gym` in gym context. Personal breakdowns shared to gym become coach-visible without moving.
- **entitlements** (designed now, unused in v1): `(user_id, plan, status, source: iap_apple | iap_google | stripe | manual, current_period_end)`.
- **share_links**: `(id, token, type: profile | breakdown, subject_id, created_by, redact_opponents (default true), revoked, created_at)` — public, unauthenticated read via token; the first genuinely public surface in MatOS.

### 2.3 Auth changes

- Self-serve signup (email + password via Supabase) creating account + personal workspace + GDPR consent record.
- Invite flow extended: inviting an email with an existing account triggers **attach flow** (accept in-app) instead of account creation. Old flow unchanged for new emails.
- Session context now carries active workspace/gym; UI gets a context switcher only when >1 membership exists.
- **Self-serve account deletion** (Apple requirement + GDPR): solo users delete entirely in-app — personal workspace and all contents hard-deleted, anonymisation rules for any gym-context data follow the existing GDPR flow.

### 2.4 RLS impact

Every policy keyed on gym_id continues to work (personal workspace = a gym row). New policies: memberships (own rows readable; gym owner reads gym's), share_links (public SELECT by token via security-definer function only — never a blanket public policy on underlying tables; the share endpoint resolves token → renders a sanitised, redacted projection), breakdowns visibility column enforced in coach-read policies.

**This entire section is BLOCKING-gated (security + database reviewers) before any mobile code consumes it.**

---

## 3. Mobile App (Project B)

### 3.1 Stack

- Expo (managed workflow) + TypeScript strict, npm workspaces
- expo-router (file-based navigation, mirrors Next mental model)
- NativeWind (Tailwind-compatible styling, reuse design tokens: navy #1B4F72, Inter; Bebas Neue for display)
- TanStack Query + Supabase JS (shared client factory from packages/shared)
- expo-video (playback), expo-image-picker (gallery), expo-camera (recording), expo-notifications (push), expo-file-system (local drafts)
- EAS Build + EAS Submit for store pipelines; TestFlight + Play internal testing for beta

### 3.2 v1 feature set (all IN per interview)

- Solo signup + personal workspace, full analysis functionality
- Gym-member login + in-app invite claim + attach flow for existing accounts
- Athlete portal: home, check-in, attendance, progress (belt timeline), logs
- Gym teasers for solo users ("invite your coach" — with a shareable link to a landing page)
- Analysis: breakdown list/create, external people, profiles, comparison
- **Native fullscreen tagging player** (§3.3)
- Video source: gallery selection AND in-app recording (record a roll → tag immediately)
- Push notifications v1 trio: belt promotion, class reminder, breakdown shared with you
- Share cards: profile card + breakdown summary as image (IG/TikTok-ready) and public link; **opponent names redacted by default**, toggle per share
- Offline: tagging fully offline (local draft via expo-file-system, sync on reconnect); check-in queued offline and submitted on reconnect with server-side timestamp reconciliation
- Self-serve account deletion in settings
- OUT: payments (schema-ready only), coach dashboard, friends/posts/feeds, agent, kiosk mode

### 3.3 Native tagging player (the headline)

The web fullscreen constraints do not exist in RN — the app owns the screen. Design carries over the U-plan contract, natively:

- Landscape-first fullscreen player, expo-video with fully custom controls
- Category rail (5 categories + Position) overlaid on one edge, auto-fade, thumb-reach placement
- **Timestamp captured at first rail tap** — the U-plan's golden rule, unchanged
- Tap → pause → native overlay (event grid → modifier/outcome sheet) → confirm → auto-resume
- Undo toast (4s); timeline strip as a swipe-up sheet
- Recording flow: expo-camera capture → file lands in the same local pipeline as gallery picks → straight into tagging
- All tagging state in a local draft file; server sync is explicit save + auto-sync when online. Video never leaves the device (recording included — recorded files stay in the device library/app storage, only the breakdown syncs)

### 3.4 Store compliance checklist (build into M9, not discovered at review)

- In-app account deletion (done in v1 scope)
- Privacy nutrition labels / Data Safety form: account data, analysis data; **no video collected** is a genuine selling point — state it
- Camera + photo library permission strings with honest purpose text
- Push permission requested in context (after first relevant event, not at launch)
- Public share links serve a web page (apps/web public route) — Apple requires shared links to work without the app

---

## 4. Build Sequence

Project A stages (web + schema) then Project B (mobile). Gates as ever; A-stages block B-stages that consume them.

| Stage | Content                                                                                                                                                                              | Gate                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| S0    | Monorepo restructure: apps/web move, packages/shared extraction (types, Zod, taxonomy, metrics, Supabase factory). Full web regression — nothing user-visible changes                | code-reviewer + full manual regression     |
| S1    | Schema: gyms.kind, memberships, breakdowns.visibility, entitlements, share_links + all RLS changes + migrations                                                                      | **security + database reviewers BLOCKING** |
| S2    | Web: solo signup + personal workspace creation, attach flow for existing accounts, context switcher, self-serve deletion, breakdown visibility toggle + coach-visibility enforcement | all reviewers                              |
| S3    | Web: public share pages (profile card / breakdown, token-resolved, redaction default) + share image generation                                                                       | security review (first public surface)     |
| M0    | Expo scaffold in apps/mobile, EAS config, navigation shell, design tokens via NativeWind, auth screens (solo signup, login, invite claim, attach)                                    | code-reviewer                              |
| M1    | Athlete portal screens + gym teasers + push infra (token registration; no sends yet)                                                                                                 | code-reviewer                              |
| M2    | Analysis: breakdown CRUD, external people, metadata flow, gallery video selection                                                                                                    | code-reviewer                              |
| M3    | **Native tagging player**: fullscreen, rail, overlay flow, timestamp-at-first-tap, undo, timeline sheet, offline local drafts + sync                                                 | **all reviewers** — core interaction       |
| M4    | In-app recording → tagging pipeline                                                                                                                                                  | code-reviewer                              |
| M5    | Profiles, comparison, share cards (image + link) from mobile                                                                                                                         | all reviewers                              |
| M6    | Push sends wired (promotion, class reminder, breakdown shared) via Supabase → Expo push                                                                                              | code-reviewer                              |
| M7    | Offline hardening: queued check-in, reconnect reconciliation, airplane-mode test pass                                                                                                | code-reviewer                              |
| M8    | Polish + device matrix (iOS Safari-free at last: iPhone SE→Pro Max, small Android, tablet sanity)                                                                                    | UX review                                  |
| M9    | Store prep: icons, screenshots, privacy labels, permission strings, **Apple account decision due**, TestFlight + Play internal tracks                                                | full ECC pass **BLOCKING**                 |
| M10   | Beta distribution to test users; feedback loop; fixes                                                                                                                                | —                                          |

## 5. Deferred (tracked)

Payments (IAP + Stripe, entitlements activate) · coach/owner mobile app · friends, posts, feeds · agent on mobile · kiosk mode (est. €200–250/gym hardware, Fully Kiosk ~€8/device — documented, later) · gym billing model · web/app long-term split decision · Apple individual-vs-business (due M9).
