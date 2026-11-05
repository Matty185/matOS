# 13 — Open questions for the founder

## Critical (they shape brand, product and pricing)

1. **Who is the primary customer:** gym owners (B2B, web-first) or athletes (B2C, app-first)? The codebase serves both; the current focus is gyms, and the athlete app is parked.
2. **Target market for launch:** Ireland only, UK/EU, or English-speaking worldwide? (This decides currency, language, phone defaults, tax and data residency.)
3. **Business model:** subscription per gym, tiered by members, a fee on payments, athlete subscriptions, or a mix? What price range is acceptable to the first gyms?
4. **Billing ambition:** will MatOS offer integrated recurring billing (Stripe Connect / GoCardless), knowing it's the market's headline feature?
5. **Role of the assistant:** a core selling point (which affects cost and pricing) or a bonus? Should it have a name or persona?
6. **Match analysis:** is it a gym feature, an athlete product, or a separate brand?
7. **Name and spelling:** "MatOS", "matOS" or "MATOS"? Have trademark, domain and handle checks been done?
8. **Domain:** when will one be bought? (It's needed for email, the website, store listings and professional invites.)
9. **Legal entity and trust documents:** company, terms, privacy policy, a DPA with gyms, Supabase region.

## Important

10. Which competitors do gym owners you know actually use today, and what do they dislike about them?
11. Will MatOS stay BJJ-only, or expand to other grappling or martial arts?
12. Should the mobile app be one role-aware app (athletes + coaches) or athlete-only?
13. How much should gyms be able to brand the member experience (logo, colours)?
14. What did Northside BJJ's coach say after onboarding? Which features did he use, ignore or ask for?
15. Is a curated demo dataset acceptable for marketing screenshots, and who approves it?

## Optional

16. Preferred brand personality from `12-brand-strategy-inputs.md` §2?
17. Any colours, fonts or imagery that are off-limits (or loved)?
18. Interest in competition features (team registrations, results) or community features (feeds, friends)?
19. Kiosk hardware: will gyms supply tablets, or should MatOS recommend or supply one?
20. Long-term: franchises and associations (lineage, certifications)?

## Uncertainties found in this audit

- **Real-device behaviour of the mobile app:** never run on hardware.
- **Backups and PITR:** depend on the Supabase plan, which isn't visible in the repo.
- **Competitor prices:** these come from third-party listings and must be confirmed.
- **Screenshot data:** this audit used a synthetic test gym, so some names look like test data, and belt colours are broken.
