# 05 — Visual identity audit

Screens referenced are in `assets/web/` and `assets/mobile/`; overviews in `assets/contact-sheets/`.

## 1. What exists

| Element                 | Current state                                                                                                                                                                                                                | Evidence                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Logo**                | **None.** The brand is the word "MATOS" set in Bebas Neue, navy. The web app/PWA icons are a plain navy square with no mark. The mobile app icon and splash are **Expo's default template** (blue "Λ" on a grid), not MatOS. | `assets/branding/web-pwa-icon-512.png`, `assets/branding/mobile-icon.png` |
| **Name styling**        | "MatOS" in docs and the app manifest; rendered uppercase "MATOS" in the UI (Bebas Neue is caps-only).                                                                                                                        | `apps/web/src/app/layout.tsx`, `public/manifest.json`                     |
| **Primary colour**      | Deep navy `#1B4F72` (HSL 204 62% 28%). Used for primary buttons, active nav item, headings on mobile, theme colour, Android adaptive icon background.                                                                        | `apps/web/src/app/globals.css`, `app.json`                                |
| **Other colours**       | shadcn/ui "slate" neutrals; destructive red raised to red-600 for WCAG AA; amber for "unpaid"; green for "paid" (athlete card). Chart palette tokens are shadcn defaults and unused except chart-1.                          | `globals.css`                                                             |
| **Typography**          | Headings: Bebas Neue (condensed, all caps). Body: Inter. Same fonts bundled in the mobile app.                                                                                                                               | `layout.tsx`, `apps/mobile/assets/fonts`                                  |
| **Radius / surfaces**   | 0.5rem radius, white cards with 1px light borders, little or no shadow.                                                                                                                                                      | `tailwind.config.ts`                                                      |
| **Iconography**         | Web: lucide line icons, consistent stroke. Mobile tab bar: **emoji** (🏠 ✅ 📈 🎥 👤).                                                                                                                                       | `assets/mobile/mobile-home.png`                                           |
| **Signature component** | `<BeltDisplay />`: a belt-shaped chip with a black bar and up to four stripe dots, plus kids-belt variants. **Currently renders without colour** (see the defect in `02-feature-inventory.md`).                              | `assets/components/members-table.png`                                     |
| **Tagline / messaging** | None in the product. Login says "Sign in to your gym account"; manifest description "BJJ gym management platform".                                                                                                           | `login--desktop.png`                                                      |
| **Dark mode**           | Tokens defined, not active.                                                                                                                                                                                                  | `globals.css`                                                             |

## 2. Assessment (with reasons)

**What looks professional**

- _Consistency._ One component library (shadcn/Radix), one icon set, one spacing rhythm across ~40 screens. Nothing looks bolted on.
- _Restraint._ White space, a single accent colour and clear hierarchy make data-dense screens (members list, payments grid) readable.
- _Accessibility discipline._ 44px touch targets, AA contrast fixes and phone layouts on every screen are visible in the screenshots; that reads as care.

**What looks generic**

- shadcn defaults are recognisable to anyone who has seen modern SaaS dashboards: the same cards, badges, selects and slate greys. Swap the word "MATOS" and it could be any admin tool.
- Navy + white is the default "trustworthy B2B" palette; it signals competence but not jiu-jitsu.
- No imagery, illustration or texture anywhere. Empty states use a grey line icon and a sentence.

**What feels unfinished (rather than outdated)**

- No logo or app icon (the Expo template icon would be rejected at App Store review as placeholder-looking).
- The mobile tab bar's emoji clash with the web's line icons and with the navy brand.
- Belts without colour, the one element that should make the product feel BJJ-native.
- Badges compete: a member row can carry red "Unpaid", red "Invite expired" and red "No waiver" at once (`members-list--desktop.png`). Red is doing three jobs.
- The assistant panel shows the same intro text twice (`assistant-panel--desktop.png`).

**What could become recognisable MatOS elements**

1. **The belt chip.** Colour + black bar + stripe dots is already a native BJJ visual; it can scale up into iconography, progress graphics and share cards.
2. **Bebas Neue headings.** Condensed caps evoke fight posters, competition brackets and gym signage. That's a fitting heritage, used sparingly today.
3. **Mat/tatami cues.** The name "MatOS" ("mat" + "OS") invites a grid/mat motif, a square mark or a tape-on-mat texture.
4. **The share card** (1080×1920 navy poster with stats) is the one marketing-facing surface already designed; it can carry the identity onto Instagram/TikTok.

**Preserve**

- Bebas Neue + Inter pairing (distinctive and legible).
- Navy as an anchor colour (familiarity for owners; trust when money is shown).
- Component consistency and accessibility standards.

**Reconsider in a redesign**

- Logo, app icon and favicon (currently missing).
- A belt-derived secondary palette (white, blue, purple, brown, black plus kids colours) for data visualisation and accents, kept separate from status colours.
- A status colour system that doesn't overload red (overdue ≠ "not signed up" ≠ "no waiver").
- Mobile iconography: replace emoji with the web icon set or a custom set.
- Empty states and onboarding: an opportunity for illustration or photography of real training.

## 3. Screens most representative of the product (for brand work)

`dashboard--desktop.png`, `members-list--desktop.png`, `member-profile--desktop.png`, `payments--desktop.png`, `promotions--desktop.png`, `reports--desktop.png`, `athlete-home--mobile.png`, `mobile-home.png`.

**Caveat:** the screenshots use the synthetic "rehearsal" test gym. Some member names contain test suffixes (e.g. "Kid NoEmail1793…"), data volumes are small and belt colours are broken. Before producing marketing visuals, fix the belt colours and capture again from a curated demo dataset.
