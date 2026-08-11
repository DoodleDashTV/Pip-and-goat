# Doodle Dash TV Studio — Roadmap

## Milestone status

| Milestone | Focus | Status |
|-----------|-------|--------|
| **1** | Core platform: Universe, Pip/Goat, Canon, Characters, DNA, Versions, Assets, Dashboard | **COMPLETE** |
| **2** | Character production: 3D models, rigs, facial, refs, poses, expressions, animations | **COMPLETE** |
| **3** | Character DNA depth + Character Lock polish | **IN PROGRESS** |
| **4** | Character development events | **IN PROGRESS** |
| **5** | Relationships (seed Pip↔Goat) | **IN PROGRESS** |
| 6 | Locations | NOT STARTED |
| 7 | World map UI | NOT STARTED |
| 8 | Props | NOT STARTED |
| 9 | Materials / VFX library | NOT STARTED |
| 10 | Style Bible + lock | NOT STARTED |
| 11–17 | Seasons, episodes, threads, foreshadowing, memory, canon ops, context engine | NOT STARTED |
| 18–22 | Storyboards, scenes, shots, camera, lighting | NOT STARTED |
| 23–27 | Animation / pose / expression / viseme / motion systems | NOT STARTED |
| 28–38 | Production director, Blender worker, render queue/cache | NOT STARTED |
| 39–48 | Voice, dialogue, lip sync, audio, FFmpeg, captions | NOT STARTED |
| 49–50 | Optional AI video + hybrid compositing | NOT STARTED |
| 51–56 | Continuity, preflight, QC, cost, reuse, asset requests | NOT STARTED |
| 57–70 | Pipelines, polish, publishing, analytics, mobile, one-click episode | NOT STARTED |

## Milestone 1 exit criteria

- [x] Docs: audit + roadmap
- [x] PostgreSQL + Prisma migrations applied
- [x] Doodle Dash Universe seeded
- [x] Pip (`CHAR_PIP_001`) and Goat (`CHAR_GOAT_001`) seeded as founding characters
- [x] 3D model status = MISSING (not PRODUCTION_READY)
- [x] Canon foundation with lock support
- [x] Asset registry foundation
- [x] Character DNA tables + seed defaults
- [x] Character versioning (v1 for each)
- [x] Studio dashboard + character pages
- [x] API routes for universe / characters / canon / assets
- [x] Tests passing
- [x] Typecheck / lint / build green

## Milestone 2 exit criteria

- [x] Character rig registry
- [x] Facial rig registry
- [x] Reference image registry (pending review slots)
- [x] Animation / pose / expression / viseme definitions (MISSING assets)
- [x] STRICT_CHARACTER_LOCK setting + preflight blocking
- [x] Model status flow enforced (no fake PRODUCTION_READY)
- [x] Studio UI pages for libraries/rigs/references
- [x] Tests / typecheck / lint / build green

## Next milestone

**Milestone 3–5** — Character DNA polish, development events, Pip↔Goat relationship seed

Or continue with **Milestone 6** locations if preferred.

AI Story/Directing → Universe DB → Permanent characters/locations/props/animations → Scene assembly → Blender worker → Voice/Music → FFmpeg → 1080×1920 → Publishing

Sora/Seedance remain future optional providers only.
