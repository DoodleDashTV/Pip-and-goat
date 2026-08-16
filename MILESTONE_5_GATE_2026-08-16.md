# Milestone 5 gate — 2026-08-16

Character-independent episode workflow on
`cursor/studio-milestone-5-workflow-73f1`, stacked on Milestone 4
`cursor/studio-character-independent-73f1`.

Draft PR #26 remains unmerged.

## Required local gates

Paid GPU was not launched. Pip, Goat, production-library, locked voices, and
the theatrical stack were not modified.

| Command | Result |
| --- | --- |
| `pnpm test` | PASS — **428 / 428** (25 files; +13 Milestone 5) |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS — no ESLint warnings or errors |
| `pnpm validate:milestone5` | PASS — 9 / 9 (local FFmpeg animatic assembled) |
| `pnpm validate:milestone4` | PASS — 5 / 5 |
| `pnpm test:blender` | NOT RUN — out of scope; Pip/Goat untouched |
| `pnpm gates:local` | NOT RUN — would rewrite Milestone 3 visual evidence |

## Protections verified

- Theatrical / Steps 9–16 gate remains closed (`currentStage()` = `DDP_STEPS_1_8`)
- Approved fingerprint `7876ac737de60257…` unchanged
- Proxy occupants cannot create a studio Episode or call generate-final
- Workflow terminals cannot be FINAL_RENDER / THEATRICAL / PUBLISHING
- `CLOUD_RENDER_ENABLED` and `ALLOW_PAID_GPU_LAUNCH` are not `true`
- Draft PR #24 and Draft PR #26 are not merged by this work

## Evidence

`artifacts/milestone-5-workflow/`

## Not claimed

- Final Pip or Goat facial controls, weights, animation, or lip-sync
- Theatrical character binding
- Voice synthesis
- Paid GPU or cloud render
- Merge of PR #26 or #24
