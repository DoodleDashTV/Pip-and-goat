# Doodle Dash Production

Persistent Blender-first 3D animation production platform for **extremely high-quality children’s animated episodes** at the **best quality per dollar**.

## Default delivery

- **1080 × 1920** (9:16 vertical)
- **30 FPS**
- **EEVEE** final (Cycles only per-shot premium override)
- YouTube Shorts compatible

## Philosophy

**CREATE ONCE → VALIDATE → VERSION → LOCK → REUSE → ASSEMBLE → RENDER**

Paid generative video (Sora, Seedance, etc.) is **optional**, **off by default**, and **never** a silent fallback when Blender cannot run.

## Core path

```
EPISODE IDEA → STORY → SHOTS → LOCKED REUSABLE ASSETS
→ REUSABLE/COMPOSED ANIMATION → CHEAP EEVEE DRAFT → REVIEW
→ RERENDER ONLY CHANGED SHOTS → APPROVAL
→ HIGH-QUALITY 1080×1920 EEVEE FINAL → AUDIO/CAPTIONS → YOUTUBE PACKAGE
```

## Stack

- Next.js + TypeScript + Tailwind
- PostgreSQL + Prisma
- Vitest
- pnpm workspaces
- Local/self-hosted Blender worker

## Setup

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open http://localhost:3000

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start web app |
| `pnpm test` | Run tests |
| `pnpm typecheck` | Typecheck packages |
| `pnpm lint` | Lint web app |
| `pnpm build` | Production build |

## Docs

- `docs/DOODLE_DASH_PRODUCTION.md`
- `docs/LOW_COST_HIGH_QUALITY_STRATEGY.md`
- `docs/ANIMATION_LIBRARY.md`
- `docs/RENDER_PROFILES.md`
- `docs/COST_GUARDIAN.md`
- `docs/EPISODE_PRODUCTION_WORKFLOW.md`
- Legacy audits/roadmaps retained under `docs/`
