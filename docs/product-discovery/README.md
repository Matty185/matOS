# MatOS — Product discovery package

A read-only audit of the MatOS codebase and running product (2026-11-05), prepared as the evidence base for brand identity, positioning, go-to-market, pricing and roadmap work. Facts are tied to file paths; hypotheses and suggestions are labelled as such.

## Start here

1. `01-executive-overview.md`: what MatOS is, who it serves, strengths and gaps.
2. `12-brand-strategy-inputs.md`: personality, positioning, taglines and visual directions to choose from.
3. `13-open-questions.md`: decisions only the founder can make.
4. `assets/contact-sheets/`: every captured screen on one page (`web-desktop-contact-sheet.png`, `mobile-contact-sheet.png`).

## All documents

| File                                      | Contents                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `01-executive-overview.md`                | Summary of product, audience, implementation, value, maturity                            |
| `02-feature-inventory.md`                 | Every feature with status, user, platform and selling-point notes                        |
| `03-user-roles-and-personas.md`           | Roles and permissions, supported segments, evidence-based and hypothetical personas      |
| `04-user-journeys.md`                     | Owner, coach, athlete, parent, prospect, visitor and solo journeys, with friction points |
| `05-visual-identity-audit.md`             | Logo, colour, type, components; what to keep or reconsider                               |
| `06-competitive-analysis.md`              | Gym-management and athlete-app competitors (sources dated 2026-11-05)                    |
| `07-commercial-model.md`                  | Existing commercial architecture and candidate pricing models                            |
| `08-mobile-strategy.md`                   | Native app state, web/mobile split, opportunities                                        |
| `09-technical-architecture.md`            | Stack, structure, data model, integrations, maturity                                     |
| `10-security-and-internationalisation.md` | Controls, accepted risks, unknowns, i18n readiness                                       |
| `11-product-opportunities.md`             | Immediate, near-term and long-term opportunities with value and complexity               |
| `12-brand-strategy-inputs.md`             | Brand inputs (not a final identity)                                                      |
| `13-open-questions.md`                    | Critical, important and optional questions                                               |
| `14-screenshot-index.md`                  | Every screenshot, area, viewport; what couldn't be captured                              |

## Assets

```
assets/
  web/             61 screenshots of the web app (desktop 1440×1000 and phone 390×844)
  mobile/          7 screenshots of the native app (Expo web mode, 390×844)
  components/      close-ups: sidebar, stat card, members table, promotion row, chart, plans card
  branding/        copies of the existing icons (no logo exists)
  contact-sheets/  HTML + PNG overviews
```

## Method and limits

- Read the repository, its plans and its Decision Log (`CLAUDE.md`); inspected the schema through migrations and types.
- Ran the web app locally against the project database and captured screens with Playwright, signed in as test accounts of a synthetic rehearsal gym. No production customer data was viewed. No data was changed by the audit itself; the one earlier change in the same session (renaming and deactivating the fictional demo gym) was made at the founder's request before this audit began.
- Ran the mobile app in Expo's web mode. It hasn't been run on a real device.
- Competitor information comes from public listings found by web search on 2026-11-05. It hasn't been checked with vendors.
- **Found a defect, not fixed:** belt colours are stripped from the CSS on web and mobile (Tailwind content paths). See `02-feature-inventory.md`.
