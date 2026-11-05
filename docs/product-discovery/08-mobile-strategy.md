# 08 — Mobile strategy

## 1. What exists

**Native app (`apps/mobile`, Expo SDK 57):** built through stages M0–M9 (`CLAUDE.md` Decision Log), then **parked** by the founder in favour of the web gym product. Never built for a device (no EAS project, no TestFlight/Play build). Screens captured for this audit in Expo's web mode (`assets/mobile/`).

| Area                                                                                                                                      | In the native app                     | In the web app (phone layout)                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| Sign up / log in / accept invite                                                                                                          | ✅                                    | ✅                                                                         |
| Home (streak, upcoming classes)                                                                                                           | ✅                                    | ✅ + announcements, waiver prompt, membership card, Pay online             |
| Check in (with offline queue)                                                                                                             | ✅                                    | ✅ (no offline)                                                            |
| Progress (attendance, belt history, logs)                                                                                                 | ✅                                    | ✅                                                                         |
| Week timetable                                                                                                                            | ⛔                                    | ✅                                                                         |
| Waiver signing                                                                                                                            | ⛔                                    | ✅                                                                         |
| Family / parent view                                                                                                                      | ⛔                                    | ✅                                                                         |
| Match analysis: list, create, gallery pick, **native fullscreen tagging**, **in-app recording**, profiles, compare, share **image cards** | ✅ (mobile's strength)                | ✅ (tagging on web is less suited to phones; no recording, no image cards) |
| Push notifications                                                                                                                        | ✅ code (promotion, breakdown shared) | —                                                                          |
| Account deletion in-app (Apple requirement)                                                                                               | ✅                                    | ✅                                                                         |
| Coach / owner tools                                                                                                                       | ⛔ (explicit v1 decision)             | ✅ everything                                                              |

The web app already works at 390px for **every** coach screen, so coaches have a usable mobile experience in the browser today (and it is installable as a PWA).

## 2. Audiences

**Athletes:** the native app is the natural home for daily habits: check in, timetable, belt progress, membership status, announcements, push. Match analysis with recording and fullscreen tagging is the one feature that genuinely needs native.

**Owners and coaches:** quick tasks on the mat: who's in tonight, mark someone present, promote, record a payment, see flags, message a member. These exist on the web and could be surfaced in a role-aware native shell later.

## 3. Suggested division (recommendation, not a decision)

| Keep primarily on web                                                                                                                                          | Prioritise on mobile                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Setup wizard, roster import, settings, plans/prices, waiver authoring, reports, audit log, payments grid, grading day, bulk invites/QR sheets, trials pipeline | Athlete: check-in, timetable, belt progress, membership status + Pay online, announcements, waivers, push |
| Assistant (cost, longer answers)                                                                                                                               | Coach "mat mode": today's classes, live attendance, mark present, quick promote, flags                    |
|                                                                                                                                                                | Analysis: record → tag → profile → share card                                                             |

## 4. Gaps before the app can ship

1. Bring the native athlete experience up to web parity (timetable, membership card, waivers, announcements, family).
2. Replace the Expo template icon and the emoji tab icons. Fix belt colours (same Tailwind content-path defect as web).
3. Decide the Apple account (the founder chose individual for prep) and create EAS, TestFlight and Play builds.
4. Run on real devices (orientation, camera and offline behaviour have only been reviewed in code).
5. Decide whether the app is a separate brand surface ("MatOS for athletes") or one app with role-aware tabs.

## 5. Opportunities

- **Role-aware single app:** athletes see the athlete tabs; staff also get a "Coach" tab (today, attendance, flags).
- **Share cards as acquisition:** every athlete's stats card on Instagram carries the MatOS brand back to gyms.
- **Kiosk app:** the web kiosk could become a dedicated tablet app (guided access, auto-relaunch).
- **Widgets / wallet passes:** next class, streak, belt.
