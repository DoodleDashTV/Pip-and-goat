# Milestone 3 Gate — 2026-08-14

Production consumers for the completed Steps 1–8 systems. Started from the
republished Milestone 2 checkpoint `19a76c61a1da3d54c20d98a9074c76b33779b1e7`
on a new branch. Did not use empty `main`. Did not modify PR #11’s branch.

## Identity

| Field | Value |
| --- | --- |
| Starting checkpoint | `19a76c61a1da3d54c20d98a9074c76b33779b1e7` (Milestone 2 recovery) |
| Working branch | `cursor/trivvlejoy-milestone-3-1ebc` |
| Scope | Opt-in Blender consumers for acting, emotion, face, lighting, VFX |

## Runtime

| Item | Result |
| --- | --- |
| Date (UTC) | 2026-08-14 |
| Blender | `/usr/local/bin/blender` → **4.2.3 LTS** (`0e22e4fcea03`) |
| View transform | `Khronos PBR Neutral` |
| `CLOUD_RENDER_ENABLED` | `false` |
| `ALLOW_PAID_GPU_LAUNCH` | `false` |
| Paid GPU / RunPod / cloud render / paid provider | **none launched** |

## What landed

- `projectShotMeta()` now projects `acting`, `emotion`, and a richer `face`
  payload under the existing opt-in `direction` block. Top-level `shot_meta`
  keys are unchanged. The original `facial` cue map is preserved.
- `assemble_scene.py` gained `apply_direction_acting`,
  `apply_direction_emotion`, `apply_direction_face`,
  `apply_direction_lighting`, `apply_direction_vfx`, plus
  `commit_direction_overlays` so overlays ADD and cannot replace authored
  actions.
- Each consumer returns immediately when `direction` is absent.
- Lighting consumers do not retune `LIGHTING_STATES`. Practicals are additive
  and cast no shadows. VFX objects cast no shadows.
- Facial consumers drive shape keys only. The shadow-caster path is untouched.
- The draft `--render` harness now calls `assemble_scene.py` with its real CLI
  (`--scene-id`, `--shot-meta`, `--assets-json-file`, `--output-dir`) and
  renders one local EEVEE still.

## Required commands

| Command | Result |
| --- | --- |
| `blender --version` | PASS — 4.2.3 LTS |
| Khronos PBR Neutral python-expr | PASS |
| `pnpm test` | PASS — **23 files / 395 tests** (was 22 / 385) |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS — no ESLint warnings or errors |
| `pnpm test:blender` (`scripts/assets/test_rig_gates.py`) | PASS — **44 / 44** |
| `pnpm validate:steps1-8` | PASS — **17 passed, 0 failed, 1 skipped** |
| `pnpm validate:steps1-8 -- --render` | PASS — **18 passed, 0 failed, 0 skipped** (local CPU EEVEE still) |
| `pnpm test:color` | PASS — **19 / 19** |
| `pnpm gates:scene` | PASS — all 8 scene gates, including `NO_DUPLICATE_LIGHTS` |
| `pnpm gates:local` | PASS — 90/90 frames, all 16 visual checks |

## Protections confirmed

- Approved Pip/Goat fingerprint `7876ac737de60257…` still matches the pin.
- `production-library/` unchanged.
- Chest-seam / shadow-proxy constants and `install_shadow_proxy(...)` call
  unchanged.
- Accepted visual thresholds unchanged.
- 1080×1920 / 30 fps and 15/30/45/60-second production options unchanged.
- `targetDurationSeconds` still allows future 2/3/5-minute plans (max 600s).
- Theatrical / Steps 9–16 gate remains closed.
- Paid-render flags remain `false`. Worker image was not rebuilt or re-pinned.
  `RENDER_CODE_MISMATCH` remains the intentional paid-launch block.

## Out of scope

- Theatrical CGI Asset Foundation (roadmap stage 3; needs new assets and
  human visual approval).
- Worker image rebuild / re-pin.
- Paid GPU, RunPod, cloud render, or paid voice.
- FINAL_1080P re-derivation.
