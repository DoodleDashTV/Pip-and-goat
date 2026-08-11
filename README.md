# Doodle Dash TV Studio

Persistent 3D animation production platform for **Doodle Dash TV**.

Primary pipeline:

AI Story / Directing → Universe DB → Permanent characters / locations / props / animations → Scene assembly → Blender worker → Voice / Music → FFmpeg → 1080×1920 → Publishing

Generative video providers (Sora, Seedance) are optional later — not the core.

## Milestone 1

- Doodle Dash Universe
- Founding characters: Pip (`CHAR_PIP_001`), Goat (`CHAR_GOAT_001`)
- Canon system with lock / immutable rules
- Character registry, versions, DNA layers
- Asset registry (metadata; binaries not in Postgres)
- Studio dashboard + character pages
- 3D model status: **MISSING** (not production ready)

## Stack

- Next.js + TypeScript + Tailwind
- PostgreSQL + Prisma
- Vitest
- pnpm workspaces

## Setup

```bash
cp .env.example .env
# ensure PostgreSQL is running and DATABASE_URL is correct

pnpm install
pnpm db:generate
pnpm --filter @doodle-dash/database exec prisma migrate dev --name milestone1_init
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

- `docs/DOODLE_DASH_STUDIO_AUDIT.md`
- `docs/DOODLE_DASH_STUDIO_ROADMAP.md`
