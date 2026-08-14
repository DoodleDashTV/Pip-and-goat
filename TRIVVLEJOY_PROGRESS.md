# TrivvleJoy Studio Progress

Updated: 2026-08-14

## Repository state

- Repository: `Pip-and-goat` (canonical GitHub remote for this studio)
- Working branch: `cursor/trivvlejoy-milestone-3-1ebc`
- Authoritative Milestone 2 recovery: `agent/trivvlejoy-milestone-2-recovery` @ `19a76c61a1da3d54c20d98a9074c76b33779b1e7`
- Authoritative preserved source: `cursor/ddp-steps-1-8-production-excellence-6b40` @ `4543943b7c19fc14e6d45c0dd5eec26492319efb`
- Immutable accepted baseline (PR #10 merge): `1ff46d595023ede5a33aa9e7f12cbbebe5ec9ed1`
- Empty `main` (`7614139`) is not an implementation base.

## Current milestone

Milestone 3 — Blender production consumers for Steps 1–8 **implemented and
locally validated**. Theatrical CGI Asset Foundation (roadmap stage 3) has
**not** begun.

## Completed

- Confirmed this agent booted on empty `main` @ `7614139` and branched from the
  republished Milestone 2 checkpoint `19a76c6` instead.
- Installed official Blender **4.2.3 LTS** at `/usr/local/bin/blender` and
  confirmed `Khronos PBR Neutral`.
- Installed local PostgreSQL 16 and applied the existing additive migrations.
- Projected acting, emotion, and richer face plans into the opt-in `direction`
  block without changing top-level `shot_meta` keys.
- Wired real Blender consumers: acting (eye/head lead, weight shift, overlap),
  emotion (bounded posture/fidget), face (shape-key cues, blinks, gaze),
  lighting (approved colour management + additive no-shadow practicals), and
  VFX (seeded, capped, no-shadow EEVEE instances).
- Direction overlays commit to additive NLA so they cannot replace authored
  actions (the motionless-goat failure mode).
- Fixed the draft `--render` harness to call `assemble_scene.py` with its real
  CLI and confirmed one local 360×640 EEVEE still.
- Wrote `MILESTONE_3_GATE_2026-08-14.md`.

## Tests / validation (this Milestone 3 run)

| Gate | Result |
| --- | --- |
| `blender --version` | PASS — 4.2.3 LTS |
| Khronos PBR Neutral python-expr | PASS |
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm db:generate` / `pnpm db:migrate` | PASS |
| `pnpm test` | PASS — **394 / 394** (23 files) |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS — no ESLint warnings or errors |
| `pnpm test:blender` | PASS — **44 / 44** |
| `pnpm validate:steps1-8` | PASS — **17 passed, 0 failed, 1 skipped** |
| `pnpm validate:steps1-8 -- --render` | PASS — **18 passed, 0 failed, 0 skipped** |

See `MILESTONE_3_GATE_2026-08-14.md` for the full evidence table.

## Known failures / blocker

None remaining for Milestone 3 consumer wiring.

`pnpm gates:local` (90-frame / 16-check acceptance, no direction block) is the
next confirmation that the no-direction path is unchanged. It was last run to
PASS on the Milestone 2 recovery commit.

Roadmap stage 3 (Theatrical CGI Asset Foundation) is the next *defined* studio
stage and is blocked on new production assets plus human visual approval. It
must not be started from this increment.

## Paid activity

None. No GPU, RunPod pod, billable render, deployment, merge to main/canonical,
secret change, deletion, rebase, amend, squash, or force-push occurred.
`CLOUD_RENDER_ENABLED=false` and `ALLOW_PAID_GPU_LAUNCH=false` remained set.
The worker image was not rebuilt or re-pinned. `RENDER_CODE_MISMATCH` remains
the intentional paid-launch block.

## Protections

- Pip/Goat character locks, approved asset fingerprint `7876ac737de60257…`,
  chest-seam protection, accepted visual thresholds, and deterministic direction
  behavior were not weakened.
- `production-library/` is unchanged versus `19a76c6` / `4543943`.
- PR #11’s branch `cursor/ddp-steps-1-8-production-excellence-6b40` was not
  modified or overwritten.
- 1080×1920 / 30 fps and 15/30/45/60-second production options are unchanged.
  `targetDurationSeconds` still allows future 2/3/5-minute plans (max 600s).

## Safest next action

1. Run `pnpm gates:local` on this branch to reconfirm the no-direction
   90-frame / 16-check acceptance still PASSes.
2. Stop before Theatrical CGI Asset Foundation. That stage needs new assets
   and Justin’s visual approval; it is not a conservative engineering step.
3. Do not rebuild or re-pin the worker image. Do not launch paid cloud renders.

## Resume

- Do not use empty `main` as an implementation base.
- Do not modify PR #11’s branch.
- Do not restart Steps 1–8 source-port work; it already lives at `4543943`.
- Read `MILESTONE_2_GATE_2026-08-14.md` and `MILESTONE_3_GATE_2026-08-14.md`
  before any further milestone work.
- Do not begin roadmap stage 3 (theatrical assets) or Steps 9–16. The
  theatrical gate is closed (`evaluateTheatricalGate().allowed === false`).
