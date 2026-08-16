# Milestone 5 gate — 2026-08-16

Character-independent episode workflow on
`cursor/studio-milestone-5-workflow-73f1`, stacked on Milestone 4
`cursor/studio-character-independent-73f1`.

Draft PR #26 remains unmerged.

## Required local gates

Recorded after the local run in this file.

Paid GPU was not launched. Pip, Goat, production-library, locked voices, and
the theatrical stack were not modified.

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
