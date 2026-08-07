# matos_store_prep.md — Stage M9 store submission reference

Companion doc to `matos_mobile_plan.md`'s §3.4 store compliance checklist and Stage M9's build-sequence
row ("Store prep: icons, screenshots, privacy labels, permission strings, Apple account decision due,
TestFlight + Play internal tracks"). This is reference content for whoever actually fills out App Store
Connect / Google Play Console — it is not itself a submission and nothing here has been typed into either
console. Individual Apple Developer account confirmed as the account type for this app (2026-08-07).

## What could and couldn't be done from this environment

No real Apple Developer Program or Google Play Console account exists yet, and none can be created from
here — both need the user's own payment and identity. No native simulator/device/headless browser is
available in this environment either (the same gap carried since Stage M0). Given that, this stage's scope
from this session is everything that doesn't require a live account or a real device: the content below,
plus closing two real gaps the checklist named and that were still open (in-app account deletion, and
push-permission timing — see the repo's own `CLAUDE.md` Decision Log for the M9 entry). **Not done here,
and can't be done here:** actually creating the Apple/Google developer accounts, `eas login`/`eas init`
against a real Expo account, `eas build`/`eas submit`, and real device screenshots. Those are the user's own
next steps once ready to move past prep.

## Data collected (grounded in what the code actually does, not assumed)

Confirmed by reading `apps/mobile/src` directly rather than inferring from the plan: mobile never reads or
writes the `payments` table at all — grep across the whole app returns zero matches. No analytics or crash-
reporting SDK exists anywhere in the stack (`CLAUDE.md`: "Console logging only (no Sentry)"), so there is no
third-party tracking SDK to disclose.

| Data                                        | Collected? | Notes                                                                                                                                                                                                                                                        |
| ------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name                                        | Yes        | First/last name, `members` table                                                                                                                                                                                                                             |
| Email address                               | Yes        | Supabase Auth                                                                                                                                                                                                                                                |
| Password                                    | Yes        | Supabase Auth, never stored in plaintext by the app itself                                                                                                                                                                                                   |
| Fitness/training data                       | Yes        | Attendance check-ins, belt/stripe history, training log entries (`athlete_logs`)                                                                                                                                                                             |
| User-generated content                      | Yes        | Match breakdown tags (positions/events/timestamps), training log notes                                                                                                                                                                                       |
| Video or photos                             | **No**     | Match video is never uploaded, stored, or transmitted — playback/recording is local-only; only a filename and duration are ever sent to the server. This is a genuine differentiator, not just a compliance checkbox — state it plainly in both forms below. |
| Device/push identifier                      | Yes        | Expo push token, tied to the member's account, used only to deliver MatOS's own notifications                                                                                                                                                                |
| Precise location                            | No         | Not collected anywhere in the app                                                                                                                                                                                                                            |
| Payment info                                | No         | Mobile never touches the `payments` table; payment recording is coach/web-only                                                                                                                                                                               |
| Third-party data sharing                    | No         | The Expo push token is sent to Expo's push relay to deliver notifications (a processor, not a third-party data sale/share)                                                                                                                                   |
| Data linked to identity                     | Yes        | All of the above is tied to the signed-in account                                                                                                                                                                                                            |
| Tracking (cross-app/cross-site ad tracking) | No         | MatOS does no advertising and no cross-app tracking                                                                                                                                                                                                          |

## Apple App Store — Privacy Nutrition Label (App Store Connect → App Privacy)

- **Contact Info** → Name, Email Address — linked to identity, used for App Functionality & Account
  Management. Not used for tracking.
- **Health & Fitness** → Fitness — linked to identity (attendance, belt history, training logs), used for
  App Functionality. Not used for tracking.
- **User Content** → Other User Content (match breakdown tags/notes, training log entries) — linked to
  identity, App Functionality. Explicitly **not** Photos or Videos — none collected.
- **Identifiers** → Device ID (push token) — linked to identity, used only for App Functionality
  (delivering this app's own notifications).
- No Usage Data, no Diagnostics, no Location, no Financial Info, no data used for third-party advertising
  or tracking.

## Google Play — Data Safety form

- **Personal info** → Name, Email address. Collected, shared with no one, required for account
  functionality, deletable on request (see below).
- **App activity** → App interactions (check-ins), Other user-generated content (breakdown tags, log
  entries). Collected, not shared, required for core functionality.
- **Photos and videos** → **Not collected.** Call this out explicitly in the form's free-text description —
  it's an unusual and accurate claim for a video-analysis app to be able to make.
- **Device or other IDs** → push token. Collected, not shared, used only for app functionality.
- Data is encrypted in transit (HTTPS/Supabase TLS). Users can request account deletion in-app (both the
  solo immediate-delete and gym coach-reviewed-request flows built at Stage M9 — see `account.tsx`).

## Permission strings (already live in `apps/mobile/app.json`, confirmed honest, no changes needed)

- Photo library (`expo-image-picker`): _"MatOS needs access to your videos to select match footage to
  analyze. Video is never uploaded — it stays on your device."_
- Camera (`expo-camera`): _"MatOS needs access to your camera to record BJJ rolls for tagging. Video is
  never uploaded — it stays on your device."_
- Microphone (`expo-camera`): _"MatOS needs access to your microphone to record audio with your rolls.
  Video is never uploaded — it stays on your device."_
- Push notifications: no static Info.plist string needed (handled by the OS permission dialog directly);
  confirmed at Stage M9 to fire in context (after a real check-in) rather than at app launch — see
  `apps/mobile/src/lib/push-registration.ts`.

## Store listing copy (draft — edit freely, nothing here is final)

**App name:** MatOS
**Subtitle / short description:** BJJ training, check-ins, and match analysis
**Description draft:**

> MatOS is a training companion for BJJ athletes. Check in to class, track your attendance streak and
> belt progression, and log what you're working on after every session.
>
> Break down your matches position by position — tap to tag takedowns, submissions, and positional
> control while you watch your own footage, and build a real stats profile over time: submission rates,
> time-in-position, and more.
>
> Your video never leaves your device. MatOS never uploads, stores, or transmits your match footage —
> only the tags you create from it. Record or select a clip, tag it, and the video stays exactly where
> it already was.
>
> Training with a gym on MatOS already? Link your account. Training on your own? MatOS works as a full
> personal training log with no gym required.

**Keywords (draft):** BJJ, jiu jitsu, grappling, martial arts, training log, match analysis, attendance

## Screenshots — deferred, needs a real device or simulator

Not producible from this environment. Whenever a real device/simulator/EAS build is available: capture
Home, Check-in, Progress, the tagging player mid-session, and a profile/comparison screen — these are the
screens the store listing copy above is written to match.
