# Milestone 4 gate — 2026-08-16

Character-independent pre-production on
`cursor/studio-character-independent-73f1`, branched from Milestone 3
`2fdac1d5783a1aaca55953214cc140eb9525085a`.

Ending commit recorded after the local run.

## Required local gates

Paid GPU was not launched. Blender 4.2.3 LTS is not installed in this
environment, so Blender-dependent gates were not re-run and the committed
Milestone 3 visual evidence was left untouched.

| Command | Result |
| --- | --- |
| `pnpm test` | PASS — **415 / 415** (24 files; +20 Milestone 4) |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS — no ESLint warnings or errors |
| `pnpm validate:milestone4` | PASS — 5 / 5 |
| `pnpm validate:steps1-8` | PASS — **17 passed, 0 failed, 1 skipped** (draft Blender render not requested) |
| `pnpm test:blender` | NOT RUN — `blender` absent |
| `pnpm gates:local` | NOT RUN — would rewrite Milestone 3 visual evidence; Blender absent |

## Protections verified

- Theatrical / Steps 9–16 gate remains closed (`currentStage()` = `DDP_STEPS_1_8`)
- Approved fingerprint `7876ac737de60257…` unchanged
- Proxy occupants cannot enter FINAL output, production-library, locked voices, or a story-approved ScenePlan
- Draft PR #24 is not this branch
- `CLOUD_RENDER_ENABLED` and `ALLOW_PAID_GPU_LAUNCH` are not `true`

## Evidence

`artifacts/milestone-4-preproduction/`

## Not claimed

- Final Pip or Goat facial controls, weights, animation, or lip-sync
- Theatrical character binding
- Hero renders
- Merge to any production branch
