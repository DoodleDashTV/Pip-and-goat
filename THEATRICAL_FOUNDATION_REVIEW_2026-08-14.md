# Theatrical CGI Asset Foundation — review for Justin

**Status:** Stopped at the visual-approval gate. **No asset group is approved.**
**Starting commit:** `2fdac1d5783a1aaca55953214cc140eb9525085a`
**Ending commit:** recorded after this branch’s commits
**Branch:** `cursor/theatrical-asset-foundation-1ebc`
**PR #13:** left untouched (Milestone 3 over `agent/trivvlejoy-milestone-2-recovery`)

## What this is

Inventory, measurable requirements, identity-preserving shader look-dev, and labeled local stills.
Not a canonical replacement. Not Steps 9–16. Not a golden scene.

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

## Paid / external confirmation

No RunPod, paid GPU, cloud render, deploy, worker rebuild/re-pin, purchase, or credential change.
`CLOUD_RENDER_ENABLED=false`. `ALLOW_PAID_GPU_LAUNCH=false`.

## Review package

- `theatrical-foundation/ASSET_INVENTORY.md`
- `theatrical-foundation/THEATRICAL_CGI_REQUIREMENTS.md`
- `theatrical-foundation/SIDE_BY_SIDE.md`
- `theatrical-foundation/PREVIEW_INDEX.md`
- `artifacts/theatrical-foundation/previews/`
