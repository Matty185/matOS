# MatOS brand guidelines

Status: provisional. The logo hasn't been checked for trademark or distinctiveness; do that before any public launch.

**Descriptor:** The connected platform for Brazilian Jiu-Jitsu academies and athletes.
**Tagline:** Less admin. More time on the mats.

Say "academy" in anything people read. The code, database and API still say `gym`, and that's deliberate.

## Logo

| File                               | Use                                             |
| ---------------------------------- | ----------------------------------------------- |
| `logo-horizontal-color`            | Default, on white or off-white                  |
| `logo-horizontal-reversed`         | On navy or dark surfaces                        |
| `logo-stacked-color` / `-reversed` | Square-ish spaces                               |
| `mark-color` / `mark-reversed`     | Where the name is already visible, small spaces |
| `mark-mono-navy` / `mono-white`    | One-colour print, engraving, silhouettes        |

- Source files are in `assets/brand/`. All are outlined vectors, so no font needs to be loaded.
- Web uses `<Logo />` (`apps/web/src/components/shared/logo.tsx`), which reads `apps/web/public/brand/`. To replace the logo, replace those files.
- Mobile uses PNGs in `apps/mobile/assets/images/`.
- Below about 16 px tall, use the mark only. Don't recolour, stretch, outline or add effects.

## Colour

| Name      | Value     | Use                                                                                                |
| --------- | --------- | -------------------------------------------------------------------------------------------------- |
| Navy      | `#0B1B33` | Primary: buttons, sidebar, headings, text                                                          |
| Blue      | `#00A3FF` | Accent: logo, highlights on navy. **Never** as text or behind white text on light surfaces (2.7:1) |
| Blue, AA  | `#0369A1` | Focus rings on light surfaces                                                                      |
| Off-white | `#F8FAFC` | Page background; cards are white                                                                   |
| Graphite  | `#4B5563` | Secondary text                                                                                     |
| Success   | `#15803D` | Text and icons (brand `#22C55E` is 2.3:1 on white)                                                 |
| Warning   | `#B45309` | Text and icons (brand `#F59E0B` is 2.2:1 on white)                                                 |
| Error     | `#DC2626` | Text and destructive buttons (brand `#EF4444` is 3.8:1 on white)                                   |

- Web tokens are in `apps/web/src/app/globals.css`. Mobile's are in `apps/mobile/tailwind.config.js` and `app.json`.
- Red means overdue, cancelled or destructive. Admin gaps such as a missing waiver or an expired invite are amber.
- Belt colours describe rank only and are never used for status.

## Type

Bebas Neue for headings, Inter for everything else. Both are already loaded in the web and mobile apps.
