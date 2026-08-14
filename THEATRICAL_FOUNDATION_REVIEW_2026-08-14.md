# Theatrical CGI Asset Foundation — review for Justin

**Status:** Stopped at the visual-approval gate. **No asset group is approved.**
**Starting commit:** `2fdac1d5783a1aaca55953214cc140eb9525085a`
**Implementation commit:** `633b1e2c` (full hash on the branch)
**Branch:** `cursor/theatrical-asset-foundation-1ebc`
**New PR:** #14 (draft, base `cursor/trivvlejoy-milestone-3-1ebc`)
**PR #13:** left untouched (Milestone 3 over `agent/trivvlejoy-milestone-2-recovery`, MERGEABLE)

## What this is

Inventory, measurable requirements, identity-preserving shader look-dev, and labeled local stills.
Not a canonical replacement. Not Steps 9–16. Not a golden scene. Tests passing ≠ approved.

## Asset inventory (summary)

| Class | Assets |
| --- | --- |
| Production-ready (pipeline) | `pip_production.blend`, `goat_production.blend`, `meadow_production.blend`, `adventure_map.blend` |
| Reusable | The four library blends; locked `LIGHTING_STATES`; Milestone 3 additive practicals/VFX; Khronos PBR Neutral |
| Needs upgrade | Pip/Goat shaders+mesh+groom+eyes; meadow terrain; map textures; set lighting; VFX library |
| Missing | `LOC_CREEK_001`, theatrical bindings, groom caches, 2K/4K PBR, eye-aim rigs, feature animation library |
| Prohibited | Paid/unlicensed marketplace assets |

Full write-up: `theatrical-foundation/ASSET_INVENTORY.md`

## Assets created or upgraded

| Item | Label | Location |
| --- | --- | --- |
| Shader recipes v0 | proposed upgrade | `theatrical-foundation/proposed/shader_recipes_v0.json` |
| Materials datablock dump | proposed upgrade | `theatrical-foundation/proposed/materials_v0.blend` |
| 28 local stills | existing / proposed / diagnostic | `artifacts/theatrical-foundation/previews/` |

Canonical `production-library/` files were **not** replaced.

## Exact test and gate results

| Gate | Result |
| --- | --- |
| `pnpm test` | PASS — **403 / 403** |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test:blender` | PASS — **49 / 49** |
| `pnpm test:color` | PASS — **19 / 19** |
| `pnpm validate:steps1-8` | PASS — 17 passed, 1 skipped |
| `pnpm validate:steps1-8 -- --render` | PASS — **18 / 18** |
| `pnpm gates:scene` | PASS — all 8 |
| `pnpm gates:local` | PASS — 90/90 frames, all 16 visual checks |

## Recommendation per asset group

| Group | Recommendation | Why |
| --- | --- | --- |
| Pip mesh / groom / eye-aim | **Revise** | Still sphere kitbash; nub beak; stub wings; no feather volume; no eye bones |
| Goat mesh / groom / eye-aim | **Revise** | Still toy-primitive; simplified horns; no fur volume; no eye bones |
| Proposed character shaders v0 | **Revise** | Useful look-dev; does not reach theatrical fidelity; do not promote to `ASSET_BINDINGS` |
| Meadow / creek | **Revise** | Meadow is a 4-vert kitbash; `LOC_CREEK_001` is missing |
| Map prop shaders | **Revise** | No paper-fiber maps; roughness-only change |
| Lighting / VFX libraries | **Revise** | Do not retune `LIGHTING_STATES`; reusable theatrical VFX caches are missing |
| Canonical `production-library/` replaces | **Reject** | Fingerprint pin must stay until a later approved sculpt/groom pass |

## Remaining defects / risks

- Shader delta is subtle at 270×480 / 8 samples; do not mistake that for theatrical quality.
- Goat close-up framing is tighter than ideal (preview camera, not a mesh change).
- No groom, maps, eye-aim bones, creek set, or feature animation library exist yet.
- `RENDER_CODE_MISMATCH` remains the intentional paid-launch block; worker image was not re-pinned.

## Paid / external confirmation

No RunPod, paid GPU, cloud render, deploy, worker rebuild/re-pin, purchase, or credential change.
`CLOUD_RENDER_ENABLED=false`. `ALLOW_PAID_GPU_LAUNCH=false`.

## Review package

- `theatrical-foundation/ASSET_INVENTORY.md`
- `theatrical-foundation/THEATRICAL_CGI_REQUIREMENTS.md`
- `theatrical-foundation/SIDE_BY_SIDE.md`
- `theatrical-foundation/PREVIEW_INDEX.md`
- `artifacts/theatrical-foundation/previews/`
