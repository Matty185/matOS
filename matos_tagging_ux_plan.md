# MatOS — Tagging UX Redesign: Improvement Plan

**Version:** 1.0
**Status:** Ready for execution via Claude Code
**Prerequisite:** Analysis module tagging tool built and functional (current state)
**Scope:** UX-layer redesign of the tagging screen only. No schema changes, no data model changes, no changes to tagging semantics (event + modifier + outcome, timestamp capture, position intervals). Everything in the module plan's §3 taxonomy and §5 data model is untouched.

---

## 1. Problem

The current tagging screen stacks video above the tag panel. On desktop, tagging requires scrolling between the video and the buttons — irritating and slow. On mobile it is barely usable. Watching in fullscreen is incompatible with tagging entirely.

## 2. Design Solution — Two-Mode Tagging

The core insight: **obstruction only matters while video plays.** Tagging always pauses the video, so the UI can be minimal during playback and take the whole screen during tag entry.

### Mode 1 — Watching (video playing)

- A slim, semi-transparent **category rail** docked to one edge:
  - Desktop: right edge, vertical
  - Mobile landscape: bottom edge, horizontal
  - Mobile portrait: bottom edge (but landscape is the expected orientation; portrait must work, not excel)
- Rail contains exactly **6 buttons**: the 5 event categories (Standing / Guard / Top / Attacks / Misc) + 1 Position button. Never the full event grid.
- Rail auto-fades to low opacity (~15–20%) after 3 seconds without interaction; returns to full opacity on hover (desktop) or any screen tap (mobile).
- Playback controls (play/pause, seek, speed, timestamp) remain in their own control bar, standard video-player behaviour (auto-hide with the rail).

### Mode 2 — Tagging (triggered by any rail button)

1. User taps a category (or Position) on the rail.
2. **Timestamp is captured at this first tap** — NOT at confirm. The pause-and-think delay must not shift tag timestamps late. This is the single most important behavioural rule in this redesign.
3. Video auto-pauses.
4. A **full overlay** renders over the paused video:
   - Category tap → event grid for that category → modifier/outcome sheet (existing rules: only required fields block confirm)
   - Position tap → position grid → role selector (where applicable)
   - Overlay may cover as much of the frame as needed — the video is paused.
   - Overlay includes a visible Cancel that dismisses with no tag created.
5. Confirm → overlay dismisses → **auto-resume playback**.
6. **Undo toast** appears for 4 seconds: "Tagged: Takedown attempt (defended) — Undo". Undo deletes the tag and does not pause the video. This replaces a trip to the timeline strip for mis-taps.

### Timeline strip

Retained, but demoted: accessible via a collapse/expand control (desktop: toggle below player or in the rail; mobile: swipe-up sheet or button). Edit/delete/timestamp-adjust behaviour unchanged. It is no longer part of the primary tagging loop — the undo toast handles the common case.

## 3. Fullscreen Implementation (critical technical constraints)

These are the constraints that will silently break the feature if not stated:

1. **Never use the video element's native fullscreen.** Fullscreen the **container div** (`wrapper.requestFullscreen()`) with the video, rail, overlay, and toast absolutely positioned inside it. Native video fullscreen is browser chrome — the overlay DOM disappears.
2. **iOS Safari:** the `<video>` element MUST have the `playsinline` attribute, or iOS hijacks playback into native fullscreen and kills the custom UI.
3. **iOS fullscreen fallback:** where the Fullscreen API is unavailable on arbitrary elements, implement **fake fullscreen** — a fixed-position container filling the visual viewport (100dvh, safe-area insets respected). Visually identical in practice. Feature-detect; do not user-agent sniff.
4. Exiting fullscreen (Esc, system gesture) must land back on the two-column layout (§4) with all state intact — playback position, in-progress draft, everything.
5. Orientation: on mobile, entering fullscreen should request landscape via the Screen Orientation API where supported; degrade silently where not.

## 4. Non-Fullscreen Desktop Layout (ships regardless)

The stacked layout is replaced even outside fullscreen:

- **Two columns:** video ~70% width left; tag panel sticky in the right column — always visible, no scrolling to tag.
- The right panel in this layout may show the fuller tag interface (categories expanded or two-tap identical to fullscreen — implementer's choice, but tagging interaction rules including timestamp-at-first-tap and auto-pause apply identically).
- Below ~900px width, collapse to the mobile pattern (rail + overlay) rather than columns.

This alone fixes the desktop scrolling irritation for users who never enter fullscreen. Fullscreen is the premium path, not the only fix.

## 5. Keyboard Shortcuts (pulled forward from post-v1)

Cheap now that modes exist; desktop only:

- `Space` — play/pause
- `1–5` — open the five category overlays (identical to rail tap, including timestamp capture)
- `P` — position overlay
- `Esc` — cancel overlay (no tag) / exit fullscreen (standard order: overlay first)
- `←/→` — seek −/+5s
- `Z` — undo last tag (same window as the toast; no-op after)

No shortcut customisation. A small "?" hint listing them, visible in the control bar on desktop.

## 6. Unchanged Behaviour (explicit, so it isn't "improved" accidentally)

- Tag semantics: event + modifier + outcome rules from event_types — untouched
- Position intervals: position tag opens an interval, next closes previous — untouched
- Partial save / resume with filename+duration mismatch warning — untouched
- Local-file playback, no video upload/storage — untouched (fullscreen changes nothing about this)
- Breakdown metadata flow before tagging — untouched
- All data written identically; zero schema changes

## 7. Build Sequence

| Stage | Content                                                                                                                                                   | Gate                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| U1    | Two-column non-fullscreen desktop layout + sticky tag panel; <900px collapse                                                                              | code-reviewer                                    |
| U2    | Container fullscreen (+ iOS fake-fullscreen fallback, playsinline, orientation request); rail with auto-fade; mode switching                              | code-reviewer                                    |
| U3    | Tagging overlay flow: timestamp-at-first-tap, auto-pause, category→event→modifier sheet, position flow, cancel, auto-resume                               | **all reviewers** — this is the core interaction |
| U4    | Undo toast; timeline strip demotion (collapse/expand)                                                                                                     | code-reviewer                                    |
| U5    | Keyboard shortcuts + hint                                                                                                                                 | code-reviewer                                    |
| U6    | Cross-device pass: iOS Safari, Android Chrome, desktop Chrome/Firefox; UX review against alpha standards (44px targets, safe areas, no horizontal scroll) | **UX review + full pass**                        |

Checkpoints as always: working locally, no console errors, committed per stage.

## 8. Acceptance Criteria

- Desktop non-fullscreen: a full match can be tagged without a single scroll.
- Desktop fullscreen: a full match can be tagged without leaving fullscreen once.
- Mobile landscape: a full match can be tagged one-handed with thumb-reach on the rail.
- Every tag's timestamp corresponds to the moment of first tap, verified against slow-motion playback.
- Mis-tap recovery via undo toast in ≤2 taps.
- Exiting and re-entering fullscreen mid-breakdown loses nothing.
- iOS Safari does not hijack the video into native fullscreen at any point.
