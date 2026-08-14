# Milestone 2 Gate — 2026-08-14

Reconstructed validation checkpoint. Commit `9577499` (“validate Milestone 2 gates”)
was **not recoverable** from any local ref, reflog, dangling object, worktree, or
GitHub (`commits/9577499` → 422; `git/commits/9577499` → 404; commit search
`total_count: 0`).

This record is the executable re-run of the missing Milestone 2 gates on a new
recovery branch created from the preserved Steps 1–8 source. Milestone 3 was not
started.

## Identity

| Field | Value |
| --- | --- |
| Repository | `Pip-and-goat` (canonical GitHub remote for this studio) |
| Starting branch | `origin/cursor/ddp-steps-1-8-production-excellence-6b40` |
| Starting commit | `4543943b7c19fc14e6d45c0dd5eec26492319efb` |
| Recovery branch | `agent/trivvlejoy-milestone-2-recovery` |
| Missing commit sought | `9577499` — not found |
| PR #11 branch | untouched (`cursor/ddp-steps-1-8-production-excellence-6b40` not modified) |

## Runtime

| Item | Result |
| --- | --- |
| Date (UTC) | 2026-08-14 |
| Host | local Cloud Agent VM (no linked environment build) |
| Blender executable | `/usr/local/bin/blender` → `/usr/local/lib/blender-4.2.3-linux-x64/blender` |
| Blender version | **4.2.3 LTS** (`0e22e4fcea03`, blender-v4.2-release, 2024-10-14) |
| View transform | `Khronos PBR Neutral` (set and printed by required python-expr) |
| FFmpeg | `/usr/bin/ffmpeg` present |
| PostgreSQL | 16.14 local (`doodle_dash` + `doodle_dash_test`) |
| `CLOUD_RENDER_ENABLED` | `false` |
| `ALLOW_PAID_GPU_LAUNCH` | `false` |
| Paid GPU / RunPod / cloud render / paid provider | **none launched** |

First `pnpm gates:local` attempt aborted (`exit 134`) because `libEGL.so.1` was
absent. That is an environment library gap, not a gate bypass. After installing
`libegl1` / Mesa EGL locally, the same unmodified `pnpm gates:local` command was
re-run and required to pass.

## Required commands

| Command | Exit | Duration | Evidence |
| --- | --- | --- | --- |
| `which blender` | 0 | 3 ms | `/usr/local/bin/blender` |
| `blender --version` | 0 | 97 ms | `Blender 4.2.3 LTS` |
| Khronos PBR Neutral python-expr | 0 | 283 ms | printed `Khronos PBR Neutral` |
| `pnpm install --frozen-lockfile` | 0 | 882 ms | lockfile up to date; 15 workspace projects |
| `pnpm db:generate` | 0 | 1,983 ms | Prisma Client 6.19.3 |
| `pnpm test` | 0 | 53,238 ms | **22 files / 385 tests passed / 0 failed** |
| `pnpm typecheck` | 0 | 26,361 ms | all workspace packages `--noEmit` clean |
| `pnpm lint` | 0 | 2,607 ms | `✔ No ESLint warnings or errors` |
| `pnpm validate:steps1-8` | 0 | 1,959 ms | **17 passed, 0 failed, 1 skipped** |
| `pnpm gates:local` | 0 | 575,469 ms | **LOCAL_VISUAL_ACCEPTANCE PASS** |

Khronos command:

```bash
blender -b -noaudio --python-expr "import bpy; scene=bpy.context.scene; scene.view_settings.view_transform='Khronos PBR Neutral'; print(scene.view_settings.view_transform)"
```

## `pnpm test`

```
Test Files  22 passed (22)
     Tests  385 passed (385)
  Duration  50.51s
```

No test was skipped, mocked, or weakened to obtain this result.

## `pnpm validate:steps1-8`

Offline direction harness. **Not** a FINAL_1080P acceptance render.

| Check | Status |
| --- | --- |
| plan validates | PASS |
| scene is 10-15s at draft resolution | PASS |
| all eight systems contributed | PASS |
| both locked characters are present in every shot | PASS |
| projects to shot_meta and manifest state bags | PASS |
| motion, facial and sound QC | PASS (176 measurements in tolerance) |
| deterministic output for identical input | PASS |
| seed actually drives the plan | PASS |
| targeted invalidation | PASS |
| FFmpeg assembly executes | PASS |
| assembled mix does not clip | PASS |
| assembled mix hits its loudness target | PASS |
| individual tracks are independently replaceable | PASS |
| no paid provider required | PASS |
| cloud render remains unauthorized | PASS |
| approved Pip/Goat assets unchanged | PASS (`7876ac737de60257…`) |
| production-library untouched | PASS |
| draft Blender render | SKIPPED (harness `--render` not requested; 90-frame acceptance is `gates:local`) |

Totals: **17 passed, 0 failed, 1 skipped**.

Approved asset fingerprint still matches the accepted pin. `production-library/`
tree was not modified.

## Local Blender acceptance (`pnpm gates:local`)

Unmodified script: `scripts/assets/local_acceptance.py` via

```bash
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe blender -b -noaudio \
  --python scripts/assets/local_acceptance.py -- \
  --out artifacts/local-acceptance
```

| Field | Result |
| --- | --- |
| Gate | `LOCAL_VISUAL_ACCEPTANCE` |
| Status | **PASS** (`ok: true`) |
| Frames rendered | **90 / 90** (`frameCount: true`) |
| Resolution | 270×480 (9:16, same aspect as FINAL_1080P) |
| Samples | 16 EEVEE, software GL (llvmpipe) |
| Blender recorded in report | `4.2.3 LTS` |
| Duration | 575.469 s |

All **16** visual checks passed:

| Check | Result |
| --- | --- |
| `frameCount` | true |
| `resolution` | true |
| `staticCameraFramesRendered` | true |
| `characterPixelMotion` | true (min locked-off motion 0.043202 ≥ 0.005) |
| `noDuplicateLights` | true |
| `exposureInBand` | true |
| `highlightsPresent` | true |
| `noHighlightClipping` | true |
| `shadowsLifted` | true |
| `shadowDepthRetained` | true |
| `saturationHealthy` | true |
| `tonalRangeHealthy` | true |
| `subjectsMeasured` | true |
| `subjectSeparation` | true |
| `groundContact` | true |
| `videoEncoded` | true |

Thresholds were not edited. Character locks, chest-seam protection, accepted
visual bands, and deterministic direction behavior were left intact.

## Protections confirmed

- `production-library/` unchanged versus `4543943`.
- Approved Pip/Goat fingerprint `7876ac737de60257…` still matches the pin.
- Additive Prisma migration `20260813190000_ddp_steps_1_8_direction_layer` applied
  forward; no existing table altered or dropped.
- Paid-render flags remain unset/`false`; `readProviderStatus()` cannot grant spend.
- PR #11 source branch was not force-pushed, rebased, amended, or overwritten.

## Out of scope (explicit)

- Milestone 3 Blender consumer wiring was **not** started.
- No worker image rebuild or re-pin.
- No RunPod pod, paid GPU, cloud render, or paid voice/provider call.
- FINAL_1080P historical acceptance was not re-derived.
