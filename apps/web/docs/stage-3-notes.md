# Stage 3 Session Notes

**Date:** 2026-07-17
**Scope:** Coach dashboard shell, nav, routing, empty states, first Vercel deploy — per
`matos_project_plan.md` §10 row 3. No formal review gate is listed for Stage 3 in the build sequence
table (unlike Stages 1/2/4-8/11); did a self-review against CLAUDE.md's UI Standards instead of
spawning a reviewer agent, since none is mandated here.

---

## What was done

- **Route structure**: 12 new routes under `(coach)`/`(athlete)` route groups — `/dashboard`,
  `/members`, `/attendance`, `/classes`, `/payments`, `/audit-log`, `/settings` (coach side);
  `/home`, `/check-in`, `/progress`, `/upload`, `/account` (athlete side). Route groups are invisible
  in the URL, so these are real top-level paths sharing a layout, not nested under `/coach`/`/athlete`
  prefixes.
- **`AppShell`** (`src/components/shared/app-shell.tsx`) — shared responsive nav: persistent sidebar
  on desktop, slide-out drawer (shadcn `Sheet`) on mobile. One component, driven by a `variant:
"coach" | "athlete"` prop rather than two separate implementations.
- **Role-gated layouts** — `(coach)/layout.tsx` (coach + gym_owner; redirects athletes to `/home`),
  `(athlete)/layout.tsx` (athlete only; redirects coach/owner to `/dashboard`). `/settings` adds its
  own narrower gate on top (gym_owner only, per plan §7 "Gym settings (owner)") since the layout
  admits both coach and owner into the area generally.
- **`getCurrentMember()`** (`src/lib/auth/current-member.ts`) — Server Component equivalent of
  `withAuth`'s session/role lookup, used by every layout and the root redirect.
- **`EmptyState`** shared component, used on every placeholder list-view route per CLAUDE.md's "proper
  empty states (with an action) on every list view."
- **`/` became a role-based redirect** (`/dashboard` or `/home`) instead of the Stage 0 static
  placeholder — removed from the middleware's public-path allowlist accordingly, since it now needs a
  session to decide where to send someone.
- **Sign-out** (`src/components/shared/sign-out-button.tsx`), wired into both nav shells.
- **First Vercel deploy**: live at **https://matos-pi.vercel.app**.

## Bugs found via live testing (not by typecheck/lint/build, which stayed clean throughout)

1. **Server Components can't pass function references to Client Components.** The nav-item arrays
   (label/href/icon) were originally built in the server `layout.tsx` files, including Lucide icon
   _component references_, then passed as a `navItems` prop to the client `AppShell`. Next.js
   correctly rejects this at runtime ("Functions cannot be passed directly to Client Components...")
   — icons aren't serializable across the RSC boundary. Fixed by moving the nav-item definitions
   inside `app-shell.tsx` itself (already a Client Component), with the server layouts passing only
   plain, serializable data (`variant`, `isOwner`) instead of the icon-laden arrays.

This surfaced immediately on first login attempt in Playwright-driven testing — a good example of why
this project verifies end-to-end rather than trusting `tsc`/`next build` alone: neither one type-checks
or lints for this particular RSC serialization rule (it's a runtime error, not a build-time one).

## Decisions beyond the plan's literal text

1. **Route naming for collision-avoidance.** The plan describes coach "Attendance page" and athlete
   "My Attendance / My Progress" as separate concepts, and coach "Gym settings" vs. athlete
   "Settings" — both pairs would collide on identical URLs (`/attendance`, `/settings`) if named
   literally, since Next.js can't have two route groups resolve the same path. Athlete attendance
   history was folded into a single `/progress` route (attendance + belt timeline + logs, matching
   how the plan already describes them as one screen); athlete settings became `/account`.
2. **Placeholder action buttons are present but disabled** (e.g. Members' "Add member") rather than
   linking to not-yet-built routes or omitted entirely — satisfies CLAUDE.md's "empty states with an
   action" pattern honestly, without faking functionality Stage 4+ actually delivers.
3. **Dashboard and athlete Home use lightweight custom layouts** (stat cards, activity feed) rather
   than the generic `EmptyState` component, since the plan describes them as summary/overview screens
   with a specific shape, not simple list views.

## First Vercel deploy — what's live, what's still manual

- **Live URL**: https://matos-pi.vercel.app (project `matty-s-projects3/matos`).
- **Env vars set** in Vercel's Production environment: all five from `.env.local` that the app
  actually needs at runtime (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`), plus `NEXT_PUBLIC_APP_URL`
  updated to the real production URL after the first deploy revealed it (needed for invite links to
  point somewhere real instead of `localhost`).
- **GitHub auto-deploy is NOT connected.** `vercel link`'s automatic repo connection failed
  ("Make sure there aren't any typos and that you have access to the repository"), and a manual
  retry (`vercel git connect`) failed identically — this is an authorization gap (the Vercel GitHub
  App likely isn't installed/granted access to `Matty185/matOS` yet on the Vercel account side), not
  a typo or transient error. **Needs you**: Vercel dashboard → matos project → Settings → Git →
  Connect Repository, or install the Vercel GitHub App from GitHub's side and grant it access to
  this repo. Until then, deploys only happen via `vercel deploy --prod` run manually (or by me), not
  automatically on push.
- **Verified against the real deployment**, not just a successful build: logged in for real via
  Playwright against `https://matos-pi.vercel.app` — role-based redirect to `/dashboard` worked,
  dashboard rendered, no client-side errors, and the auth cookie correctly carried `Secure: true` in
  production (only activates when `NODE_ENV === "production"`, untestable locally) and explicit
  `SameSite: Lax`.
- `.gitignore` gained `.vercel` and a broader `.env*` pattern — both added automatically by `vercel
link`, reviewed and kept (correct, no secrets or project-linkage files are tracked).

## Not done (out of Stage 3 scope)

- Any real data-backed functionality behind the empty states — Members (Stage 4), Attendance/Classes
  (Stage 5), Payments (Stage 6), Agent/audit log content (Stage 7), Account settings actions incl.
  GDPR export/deletion (Stage 8).
- GitHub-connected auto-deploy — needs the user's one-time authorization, see above.
