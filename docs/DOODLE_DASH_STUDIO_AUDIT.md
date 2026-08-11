# Doodle Dash TV Studio — Architecture Audit (Greenfield)

**Date:** 2026-08-11  
**Milestone:** 1 (Core Platform Foundation)  
**Status:** Milestone 1 complete (greenfield bootstrap).

## Decision context

This project is built from scratch as **Doodle Dash TV Studio**, a persistent native-3D animation production platform. Generative video providers (Sora, Seedance, etc.) are deferred to later milestones as optional cinematic tools only.

## Target architecture

```
apps/
  web/                 Next.js App Router (UI + API routes)

packages/
  database/            Prisma schema, migrations, seed, client
  domain/              Shared Zod schemas + domain enums
  universe/            Universe + canon services
  characters/          Character registry, DNA, versioning services
  shared/              Shared utilities (ids, errors, storage types)

workers/
  blender-renderer/    (Milestone later — stub only)

scripts/
  blender/             (Milestone later — stub only)

docs/
```

## Milestone 1 scope (implemented)

| System | Status |
|--------|--------|
| Application shell | In progress |
| PostgreSQL + Prisma | In progress |
| Universes | In progress |
| Canon facts | In progress |
| Characters (Pip, Goat) | In progress |
| Character versions | In progress |
| Character DNA (5 layers) | In progress |
| Asset registry | In progress |
| Studio dashboard | In progress |
| Character pages | In progress |
| Tests | In progress |

## Explicitly out of scope for Milestone 1

- Blender worker / render queue
- Storyboards, scenes, shots
- Seasons / episodes / story memory
- Voice / lip sync / FFmpeg
- AI video providers
- Full 3D viewer asset loading (placeholder UI only)
- Real production 3D models (Pip/Goat models marked **MISSING**)

## Founding characters

| Internal code | Name | Founding | Model status |
|---------------|------|----------|--------------|
| `CHAR_PIP_001` | Pip | yes | MISSING |
| `CHAR_GOAT_001` | Goat | yes | MISSING |

Visual traits that would imply a final approved look are **not** invented. DNA records hold editable defaults / placeholders pending reference approval.

## Dangerous areas (future)

- Never silently fall back from reference-based generation to text-only
- Never let creative AI mutate locked canon
- Never mark models PRODUCTION_READY without tested assets
- Keep API keys server-side only
- Do not store large binaries in Postgres rows

## Recommended migration strategy after M1

1. Stabilize M1 data model with tests
2. Add 3D model / rig / facial / animation registries (Milestone 2)
3. Locations, props, style bible
4. Story systems (seasons → memory)
5. Production director + Blender worker
6. Audio + FFmpeg
7. Continuity / QC / publishing
8. Optional AI video providers last

## Database migration plan (M1)

Single initial migration creating:

- `universes`
- `canon_facts`
- `characters`
- `character_versions`
- `character_visual_dna`
- `character_personality_dna`
- `character_motion_dna`
- `character_voice_dna`
- `character_story_dna`
- `assets`
- `character_3d_models` (status tracking only; models MISSING)

## Storage

M1 defines an S3-compatible storage abstraction interface. Actual object upload is stubbed until credentials exist. Asset rows store `storage_location` metadata only.
