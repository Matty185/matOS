# Stage 0 Session Notes

**Date:** 2026-07-15
**Scope:** Repo scaffold only, per `matos_project_plan.md` §10 row 0. Stage 1 (schema + RLS) explicitly not started.

---

## What was done

### Repo / git

- `git init` at the project root.
- `.gitignore` extended beyond the create-next-app default: added `next-pwa` build artifacts (`public/sw.js`, `workbox-*.js`, etc.), editor/OS cruft, `.ecc/`.
- Confirmed `.env.local` and `node_modules` never appeared in `git status` at any point — verified this **before** the first `git add`, since `.env.local` holds live Supabase/Anthropic keys.
- One local commit so far (`35f2302`, "Stage 0: repo scaffold"). **No GitHub remote configured** — nothing has been pushed anywhere.

### Next.js scaffold

- Used `create-next-app@14` (TypeScript, Tailwind, ESLint, App Router, `src/`, `@/*` alias) — scaffolded into a throwaway `scaffold-tmp/` subfolder (its own name can't start with `_`, hence the name) because `create-next-app` refuses to run in a directory that already has non-whitelisted files (`CLAUDE.md`, `matos_project_plan.md`, `.env.local` were already present). Moved the generated files up to root and deleted the temp dir and its nested `.git`.
- Removed the default Geist font wiring and boilerplate marketing page; replaced with a minimal placeholder home page and a real `RootLayout`.

### TypeScript

- `strict: true` was already on by default; added `noUncheckedIndexedAccess: true` per CLAUDE.md. Verified with `npx tsc --noEmit` — clean.

### Tailwind + shadcn/ui — see [Incident: shadcn v4 rollback](#incident-shadcn-v4-defaulted-to-an-incompatible-setup) below

- Ended up on shadcn CLI **v2.10.0** (`new-york` style, Radix primitives, HSL CSS variables) for compatibility with the pinned Tailwind v3 / Next 14 stack.
- Primary color set to navy `#1B4F72` (converted to HSL `204.1 61.7% 27.6%` for light mode, lightened to `204.1 61.7% 40%` for dark mode) in `src/app/globals.css`.
- Inter (body) and Bebas Neue (headings) wired via `next/font/google` in `src/app/layout.tsx`, exposed as `--font-inter` / `--font-bebas-neue`, mapped to Tailwind's `font-sans` / `font-heading` in `tailwind.config.ts`.
- Added baseline components: `button`, `card`, `input`, `label`.

### PWA

- Installed `next-pwa`, wired into `next.config.mjs` (disabled in dev, registers + skip-waiting in prod).
- Generated real placeholder PNG icons (192×192, 512×512, solid navy) with a throwaway hand-rolled PNG encoder (no image library was installed, and this avoided pulling one in for two solid-color squares) — script was deleted after use, only the output PNGs are committed.
- `public/manifest.json`: name "MatOS", `theme_color`/`background_color` set, icons registered with `any maskable`.
- Confirmed `npm run build` produces `public/sw.js` and the build succeeds.

### Security headers

- Added to `next.config.mjs`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a CSP scoped to `*.supabase.co` and `api.anthropic.com` for `img-src`/`connect-src`.
- `script-src` currently includes `'unsafe-inline' 'unsafe-eval'` — see [Considerations](#considerations--flags) below, this is a known compromise, not an oversight.

### Lint / format / hooks

- Installed Prettier (+ `prettier-plugin-tailwindcss` for class sorting), `eslint-config-prettier` to kill formatting-rule conflicts.
- `husky` + `lint-staged` wired: pre-commit runs `eslint --fix` + `prettier --write` on staged files.
- **This actually caught a real bug during the session**: shadcn's generated `tailwind.config.ts` used `require("tailwindcss-animate")`, which trips `@typescript-eslint/no-require-imports` under `next/typescript`. Fixed by switching to a static ESM import. Recorded here because it's a good sign the hook works, not just plumbing.

### Folder structure

Created (with `.gitkeep` where currently empty) to match the data model / API surface in the project plan, without implementing any route logic:

```
src/app/(coach)/            src/app/(athlete)/
src/app/api/{members,classes,attendance,payments,agent,invite,audit,gym,video,auth}/
src/components/ui/          (shadcn — populated)
src/components/shared/      (empty — e.g. future <BeltDisplay />)
src/lib/{supabase,validation,agent}/   (empty — Stage 1+)
src/hooks/  src/types/
supabase/migrations/        (empty — Stage 1)
scripts/                    (empty — seed.ts lands in Stage 9)
```

No Supabase client code, Zod schemas, or agent tool definitions were written — that depends on the Stage 1 schema and felt premature to scaffold blind.

### Dependencies installed

`@supabase/supabase-js`, `@supabase/ssr`, `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `zod`, `date-fns`, `@anthropic-ai/sdk`, `resend`.

### Verification

`npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` clean (static export of the placeholder page + service worker generation). Build output (`.next/`) deleted before committing.

---

## Incident: shadcn v4 defaulted to an incompatible setup

`npx shadcn@latest init` (resolved to v4.13.0) auto-selected a "base-nova" style built for **Tailwind v4 + Base UI** (`oklch()` color tokens, `@import "shadcn/tailwind.css"`, `@base-ui/react` instead of Radix, Geist as the default font) — even though the project's `tailwind.config.ts` was a v3-style JS config. `npm run build` failed immediately (`next/font` error: Unknown font \`Geist\`, plus the Tailwind v3/v4 CSS mismatch would likely have caused further breakage even if that were fixed).

Rolled back: removed `@base-ui/react`, `shadcn`, `tw-animate-css` from `package.json`, deleted `components.json` / `src/components/ui` / `src/lib`, restored plain `globals.css` and `layout.tsx`. Re-ran with `shadcn@2.10.0` pinned explicitly, which is the last major version on the classic Radix + Tailwind v3 (HSL variables) convention that matches CLAUDE.md's locked stack. This is why `components.json` and the CSS variables look like "classic" shadcn rather than whatever the current `shadcn@latest` default is — that's intentional, not an oversight, if a future session re-runs `shadcn add` it should keep using a v2.x CLI (`npx shadcn@2.10.0 add ...`) so the two don't fight over conventions.

---

## Considerations / flags

These were raised at the end of the Stage 0 turn and are repeated here for the record:

1. ~~`.env.local` service role key is almost certainly wrong.~~ **Fixed 2026-07-15.** Re-verified: `SUPABASE_SERVICE_ROLE_KEY`'s JWT payload now carries `"role":"service_role"`, distinct from the anon key.
2. ~~No GitHub remote yet.~~ **Resolved 2026-07-15.** Remote `origin` added pointing at `https://github.com/Matty185/matOS.git`. Note: nothing has been pushed yet — commits exist locally only until an explicit push is requested.
3. **ECC agent harness not installed.** Stage 1 has a hard blocking gate on `security-reviewer` + `database-reviewer` passing before any application code is written. Installing/configuring ECC (github.com/affaan-m/ECC) wasn't in scope for this turn's explicit instructions and hasn't been done — needs to happen before Stage 1 can actually complete its gate, not necessarily before Stage 1 starts.
4. **`npm audit`: 10 vulnerabilities (1 moderate, 9 high), all inside dependency chains of the pinned `next@14.2.35` and `next-pwa`'s workbox/terser build toolchain.** `npm audit fix --force` wants to jump to `next@16` and a `next-pwa` major version — both are breaking changes that directly contradict CLAUDE.md's "Next.js 14... do not deviate without flagging" rule. Deliberately left alone rather than silently upgraded; worth a conscious call during the Stage 1 (or later) security review rather than treating it as a routine `npm audit fix`.
5. **CSP allows `'unsafe-inline' 'unsafe-eval'` on `script-src`.** This is required for Next 14 dev-mode HMR to function under a static (non-middleware, non-nonce) CSP. A nonce-based CSP would be tighter and is the more "correct" answer for the "restrictive CSP" requirement in CLAUDE.md §Working Conventions, but it needs per-request middleware to inject a nonce into both the CSP header and every inline script tag — meaningfully more complexity than Stage 0 warranted. Flagged for the pre-demo security pass (project plan §9/§11) rather than solved now.
6. **Local Node is v24; the project pins `>=20 <21` via `package.json` `engines` and `.nvmrc`.** Every `npm install` this session emitted an `EBADENGINE` warning (non-blocking). Everything installed and built fine under v24, but CLAUDE.md specifies Node 20 LTS specifically — worth switching the local dev shell to Node 20 via nvm at some point so local behavior can't silently diverge from what Vercel will run.

## Addendum (2026-07-15, later session): ECC agents installed

Resolved consideration #3 above, narrowly. Did **not** run the upstream `install.sh`/`install.ps1`
or the `/plugin marketplace` route — inspecting github.com/affaan-m/ECC first showed it's a much
larger system than CLAUDE.md's "security-reviewer, code-reviewer, database-reviewer, planner,
architect" implies (67+ agents, hooks that auto-load into _future_ Claude Code sessions globally,
bundled MCP server configs, a Python dashboard). Running its installer would have modified global
`~/.claude` config unsupervised, which wasn't warranted just to get five reviewer prompts.

Instead, copied exactly those five agent definition files (unmodified, MIT-licensed) into this
repo's `.claude/agents/` — project-scoped only, no hooks, no MCP servers, no global config touched.
See `.claude/agents/README.md` for provenance (source commit, license). This satisfies the Stage 1
blocking gate requirement (security-reviewer + database-reviewer) and the later all-reviewer gates.
If a later stage wants ECC's broader feature set, that's a deliberate separate call, not a default.

Also confirmed here: the "no GitHub remote / nothing pushed" note above is now stale — `origin/main`
matches local `HEAD` (`0482f6d`), so Stage 0's three commits are already on GitHub.

## Not done (intentionally, out of Stage 0 scope)

- Supabase schema, migrations, RLS policies (Stage 1).
- Any Supabase client code (`src/lib/supabase/*` is empty) — deferred until the Stage 1 schema exists to type against.
- Any Zod validation schemas or agent tool definitions — same reasoning.
- Any actual page/route implementation beyond the placeholder home page.
- GDPR, invite/claim flow, auth middleware — Stage 2+.
