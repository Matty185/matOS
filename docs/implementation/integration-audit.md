# MatOS brand and strategy integration: Phase 1 audit

Date: 2026-11-05. Status: founder approved 2026-11-05 (recommended answers in section 8, plus the academy wording pass). Mobile tab icons and the match analysis review remain open.

Inputs read: the master prompt, `docs/strategy/*`, `docs/brand/brand-guidelines.md`, `docs/implementation/CLAUDE-INTEGRATION.md`, `assets/*`, `docs/product-discovery/*`, `CLAUDE.md`, `matos_analysis_module_plan.md`, `matos_mobile_plan.md`.

## 1. Bottom line

- The strategy fits what's already built. It's mostly a change of emphasis, plus a brand layer on top of a working product. Nothing in it requires a rewrite or a schema change.
- The supplied assets are **not ready to integrate as they are**: the logo needs redrawing, the file names are wrong, and most of the palette fails the project's accessibility rule if used directly.
- Five items in the documents conflict with existing project rules or facts. The most important: the match-analysis strategy assumes **video upload and storage**, while MatOS's first non-negotiable is that video never touches the server (§3, C1).
- The founding academy goes live in days, so the order matters: belt fix, brand foundation, setup guide, onboarding. Mobile and match analysis must not delay that.

## 2. Source of truth

| Class                              | Items                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Confirmed strategy**             | BJJ-only until the BJJ business is profitable; Ireland, starting with Dublin; owner is the buyer; tagline "Less admin. More time on the mats."; descriptor "The connected platform for Brazilian Jiu-Jitsu academies and athletes."; two pillars (Academy, Analysis); assistant is a supporting capability; Modern Mat direction; Bebas Neue + Inter |
| **Existing functionality**         | Everything marked ✅ in `docs/product-discovery/02-feature-inventory.md`                                                                                                                                                                                                                                                                             |
| **Proposed design**                | Palette values, logo concept (explicitly provisional), product-area names (MatOS Academy / Analysis / Mobile), graphic language                                                                                                                                                                                                                      |
| **Future ambition, not a promise** | AI-assisted and automated analysis, Expected Tap (xT), hierarchical interaction taxonomy, academy-level insights, mature mobile analysis, other martial arts                                                                                                                                                                                         |
| **Open**                           | Pricing, trial terms, video storage economics, final logo, Apple/Google accounts, domain timing                                                                                                                                                                                                                                                      |
| **Out of scope for this work**     | Dublin event, website, social accounts, outreach. These come after several weeks of real use, per the roadmap                                                                                                                                                                                                                                        |

Precedence for this work: `docs/strategy/brand-strategy.md` v1.1 for positioning; `CLAUDE.md` and the module plans remain authoritative for engineering rules until the founder changes them.

## 3. Conflicts to resolve

| #      | Conflict                                                                                                                                                                                                                                                                                              | Evidence                                                                                                                                | Recommendation                                                                                                                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** | **Video upload vs "video never touches the server."** The analysis strategy assumes "upload a match", "original video" in the match record, a "matches uploaded" KPI and storage costs.                                                                                                               | `match-analysis-strategy.md` §1, §3, §7, §8.1, §9; `product-and-gtm-roadmap.md` §10; `CLAUDE.md` Match Analysis Non-Negotiable 1 and 10 | Keep the non-negotiable for now. Treat upload as a future decision with its own privacy review (footage shows third parties, sometimes minors). Don't use "upload" in product copy or marketing until decided. |
| **C2** | **"Branded mobile application" in Milestone 1 vs a parked app.** The roadmap's founding launch includes mobile and real-device testing. The app has never been built for a device and lacks waivers, timetable, membership, announcements and family views. Shipping needs developer accounts (paid). | `product-and-gtm-roadmap.md` §3, §12; `08-mobile-strategy.md`                                                                           | Founding launch runs on the **web app on phones** (already 390px-ready, installable). Treat mobile branding as a small, separate later step.                                                                   |
| **C3** | **`docs/brand/brand-guidelines.md` isn't guidelines.** It's the older v1.0 strategy: "martial arts broadly", "discipline-neutral", "BJJ-exclusive it should not be". It directly contradicts v1.1.                                                                                                    | That file §5.3, §12.2, §16                                                                                                              | Mark it superseded or remove it. Real guidelines can be written after the logo and tokens settle.                                                                                                              |
| **C4** | **"Do not commit or push unless asked" vs the project workflow** of committing at each checkpoint and deploying from `main`.                                                                                                                                                                          | Master prompt §10; `CLAUDE.md` Working Conventions                                                                                      | Founder's call (see §8). Recommendation: keep the existing workflow, since that's what you asked to preserve.                                                                                                  |
| **C5** | **Palette vs WCAG AA.** See §5. Using `#EF4444` would undo a deliberate accessibility fix from Stage 10.                                                                                                                                                                                              | `globals.css`; contrast figures in §5                                                                                                   | Keep the hues as brand colours, with AA-safe values for text and fills.                                                                                                                                        |

Smaller inconsistencies, resolved by following the newer or factual source:

- **The assistant:** `CLAUDE.md` ("core differentiator") and my discovery documents treat it as a headline; strategy v1.1 says supporting. Follow the strategy and update `CLAUDE.md`'s "What This Is" when this work lands.
- **Current analysis is described out of date:** `match-analysis-strategy.md` §4.1 says the product is mostly event tagging. In fact positional intervals with roles **and** discrete events already exist (`breakdown_positions`, `breakdown_events`), so the states-vs-events direction is already the foundation.
- **Two more analysis rules in tension:** attributing interactions to "the correct athlete" and recording ruleset consequences both go beyond current rules (single focus athlete; no ruleset/points events). Leave them for the analysis workstream. Don't change them here.
- **"A pilot academy is using the web product"** (`brand-strategy.md` §16) isn't true yet; Northside hasn't been onboarded.
- **"Warm off-white":** `#F8FAFC` is a cool slate tint. Cosmetic; accept the value.
- **Path differences from the prompt:** `assets/brand/` doesn't exist (files are in `assets/logos`, `icons`, `tokens`); the marketing file uses an underscore; no favicon, JSON tokens or brand board were supplied.
- **Dark theme:** the checklist asks to check it, but the app has no active dark mode. Don't add one in this work.

## 4. Supplied assets

**File names don't match contents** (they look scrambled during download, and have " (1)" suffixes):

| File                          | Actually contains                                                |
| ----------------------------- | ---------------------------------------------------------------- |
| `mark-color (1).svg`          | Navy-only mark                                                   |
| `mark-monochrome (1).svg`     | Two-colour stacked logo with wordmark                            |
| `mark-white-blue.svg`         | Two-colour horizontal logo with wordmark                         |
| `wordmark-horizontal (1).svg` | White-only mark, no wordmark                                     |
| `wordmark-reversed (1).svg`   | Navy + blue mark, no wordmark                                    |
| `wordmark-stacked (1).svg`    | White + blue mark, no wordmark                                   |
| `app-icon-master (1).svg`     | Same navy + blue mark, 154×82, no background: not an icon master |
| `matos.tokens (1).json`       | CSS, not JSON                                                    |

**Logo quality** (rendered on light and dark at 110, 32 and 16 px):

- The two peaks collide at the centre, leaving a stray dart shape below the join. The left path is closed and the right is open, so they don't match.
- It reads as two mountains or "AA" more than an M. At 16 px the centre becomes mush.
- It's drawn with thick strokes, not filled shapes, so it can't be scaled or adjusted cleanly, and the apex mitres touch the top of the viewBox.
- The wordmark is live `<text>`: in an `<img>` the font doesn't load, and it falls back to Impact (visible in the render). It must be converted to outlines.
- Navy-and-blue versions lose the navy half on dark backgrounds. A proper reversed version is needed.
- `CLAUDE-INTEGRATION.md` itself says trademark and distinctiveness are unchecked.

**Usable now:** the concept, the hex values, Bebas Neue + Inter (already in the product). **Needs work:** a redrawn mark as filled, optically balanced shapes, a tiny-size variant, outlined wordmarks, a square icon master and a favicon.

## 5. Palette and accessibility

`CLAUDE.md` requires WCAG AA (4.5:1 for text; 3:1 for icons and focus rings).

| Colour             | On white     | On navy | White text on it | Use                                                                                                                               |
| ------------------ | ------------ | ------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Navy `#0B1B33`     | 17.2         | —       | 17.2             | **Pass.** New primary (buttons, active nav, headings)                                                                             |
| Blue `#00A3FF`     | **2.7 fail** | 6.3     | **2.7 fail**     | Accent only: logo, on-navy highlights, decorative markers, data highlights. Never text or white-on-blue buttons on light surfaces |
| Graphite `#4B5563` | 7.6          | 2.3     | 7.6              | **Pass.** Secondary text on light                                                                                                 |
| Success `#22C55E`  | **2.3 fail** | 7.6     | **2.3 fail**     | Dots and icons with a label only; text uses `#15803D` (5.0)                                                                       |
| Warning `#F59E0B`  | **2.2 fail** | 8.0     | **2.2 fail**     | Same; text uses `#B45309` (5.0)                                                                                                   |
| Error `#EF4444`    | **3.8 fail** | 4.6     | **3.8 fail**     | Keep existing `#DC2626` (4.8) for text and buttons                                                                                |

Add a darker interactive blue, about `#0369A1` (5.9 on white), for links and focus rings on light surfaces. Belt colours stay separate and describe rank only. Charts stay single-hue navy/blue as they are.

## 6. Where brand lives today

| Item           | Location                                                                                                                                         | Change needed                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Theme tokens   | `apps/web/src/app/globals.css`, `tailwind.config.ts` (shadcn CSS variables)                                                                      | Change values in place; no second token system |
| Mobile colours | `apps/mobile/tailwind.config.js` (hard-coded `primary: "#1B4F72"`), `app.json`                                                                   | Update to match                                |
| Fonts          | `next/font` in `layout.tsx`; TTFs in `apps/mobile/assets/fonts`                                                                                  | None                                           |
| Wordmark       | Text "MatOS" in 9 web and 4 mobile files, mainly `app-shell.tsx`, `login`, `signup`, `invite`, `join`, `reset-password`, `share`, `setup-wizard` | One `<Logo />` per platform                    |
| Icons          | `apps/web/public/{favicon.png,icons/,manifest.json}`, `apps/mobile/assets/images`, `layout.tsx`                                                  | Replace generated files; update `themeColor`   |
| Share surfaces | `share/[token]/opengraph-image.tsx`, `share-card-content.tsx`                                                                                    | New navy and logo                              |
| Mobile tabs    | Emoji in `apps/mobile/src/app/(app)/_layout.tsx`                                                                                                 | Icon font (see below)                          |

**Dependencies:** no new web packages. For PNG exports, render the SVGs with the existing Playwright tooling and commit the files, so nothing new enters the build. On mobile, neither `react-native-svg` nor `@expo/vector-icons` is installed, so replacing emoji adds one dependency (`@expo/vector-icons` is the Expo-standard choice); logos can be PNGs.

**Issues confirmed still present:**

- **Belt colours are broken** on both platforms: `packages/shared` is missing from both Tailwind `content` arrays.
- **Red overload** on the members list (Unpaid, Invite expired and No waiver are all red).
- The assistant panel repeats its intro text.
- `"gym"` appears in about 109 UI strings and `"academy"` in none, while the strategy's language is "academy".

## 7. Recommended plan

Each step can ship on its own and leaves the product working.

| Step                              | Scope                                                                                                                                                                                                                            | Checks                                                                            | Timing                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **0. Belt colour fix**            | Add `packages/shared` to both Tailwind configs                                                                                                                                                                                   | Build; view belts on web and in Expo web mode                                     | Now                                                                     |
| **1. Brand foundation**           | Tidy `assets/brand/` with correct names; redraw provisional mark, outlined wordmarks, icon master, favicon; map tokens per §5; web `<Logo />`; PWA icons, `themeColor`, OG image; update `CLAUDE.md` stack line and Decision Log | `tsc`, ESLint, `next build`; logo at 16–32 px; contrast; before/after screenshots | Before onboarding                                                       |
| **2. Web consistency (targeted)** | Sidebar and login treatment; separate status colours; shared buttons, badges, cards via tokens; fix the assistant's duplicated text; empty states. No layout or navigation changes                                               | Same, plus one `code-reviewer` UX pass and phone/desktop screenshots              | Before onboarding if time allows; otherwise safe to continue afterwards |
| **3. Northside setup guide**      | The interrupted guide, using the new name and screens                                                                                                                                                                            | Walk through it against the rehearsal gym                                         | Before onboarding                                                       |
| **4. Founding academy live**      | Onboard; several weeks of real use and feedback                                                                                                                                                                                  | —                                                                                 | Founder                                                                 |
| **5. Mobile brand pass**          | Icon, splash, colours, tab icons, `<Logo />`                                                                                                                                                                                     | `tsc`; Expo web mode; **stated as not verified on a device**                      | After onboarding; app stays parked otherwise                            |
| **6. Match analysis review**      | Document current UX and weaknesses against the strategy; resolve C1 and the two rule tensions; propose visual direction. No build                                                                                                | Document only                                                                     | After onboarding, as its own workstream                                 |

Deliberately left out: `gym`→`academy` wording (touches ~109 strings and needs your decision), dark mode, website, event, pricing, AI, xT.

### How this fits the existing workflow

- **Testing:** there's no test suite by design. Checks are `tsc`, ESLint, `next build` and browser screenshots at 1440 and 390 wide. No schema, RLS, auth or payment logic changes, so **the security and database gates don't apply**, and no live database tests are needed. If a step turns out to need any of those, the normal gates return. This work doesn't change production data.
- **Docs:** Decision Log entry per step in `CLAUDE.md`; vault note `Projects/MatOS.md` at status changes.
- **Commits:** no `Co-Authored-By` trailer, per your standing preference. Only the relevant files staged; `apps/mobile/package.json`, `.playwright-cli/` and `androidstudio-screenshot/` stay out, and `docs/product-discovery.zip` too (a 10 MB duplicate).
- **Honesty:** Chromium only unless stated; no device claims.

### Risks

| Risk                                             | Mitigation                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Darker navy changes the whole app's feel at once | Token change only; compare before/after before deploying                      |
| Blue used carelessly fails contrast              | Rules in §5; reviewer checks                                                  |
| Logo is provisional and may change               | One `<Logo />` per platform, one asset folder; replacing it is a small change |
| Trademark unchecked                              | Check before any public launch; not needed for a private pilot                |
| Brand work delays onboarding                     | Steps 0, 1 and 3 are the minimum; everything else can follow                  |

## 8. Decisions needed from the founder

1. **Logo:** redraw the same two-peak M concept cleanly as a provisional mark (recommended), or wait for a designer?
2. **Commit/push:** keep the existing workflow of committing and deploying each checked step (recommended), or hold everything for review as the master prompt says?
3. **Mobile:** agree to treat branded mobile as after onboarding, with the founding launch on the web app (recommended)?
4. **Video:** confirm that "video never touches the server" stands for now, with upload treated as a future decision (recommended)?
5. **Files to tidy:** OK to reorganise `assets/` into `assets/brand/` with correct names, and to mark `docs/brand/brand-guidelines.md` as superseded?
