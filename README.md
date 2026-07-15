# MatOS

Multi-tenant BJJ gym management platform — alpha build. See `CLAUDE.md` for
operational conventions and `matos_project_plan.md` for the full spec.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in real values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

Next.js 14 (App Router, TypeScript strict) · Tailwind + shadcn/ui · Supabase
(Postgres/Auth/Storage/RLS) · TanStack Query · React Hook Form + Zod ·
Claude API (Haiku 4.5) · Resend · Vercel.

## Status

Stage 0 complete: repo scaffold, Tailwind/shadcn theme, PWA config,
lint/format/pre-commit hooks, folder structure. Schema + RLS (Stage 1) not
yet started.
