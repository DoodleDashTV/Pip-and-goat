# Theatrical CGI Requirements

**Studio:** TivvleJoy (internal: Doodle Dash / DDP)
**Stage:** `THEATRICAL_ASSET_FOUNDATION`
**Status:** Requirements defined. **No asset group is approved.**
**Canonical fingerprint (must stay):** `7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7`

These numbers come from existing locks (`docs/CHARACTERS/*`, `packages/direction/src/locks.ts`, `quality.ts`, `PRODUCTION_MODEL_REQUIREMENTS.md`, `VISUAL_APPROVAL_PIP_GOAT_V1_1.md`). They do not invent a second architecture.

Theatrical quality means production fidelity, materials, deformation, expression, and presentation. It does **not** mean redesigning Pip or Goat.

Passing automated tests does **not** satisfy any row below.

## Shared production locks (do not weaken)

| Lock | Required value |
| --- | --- |
| Delivery | 1080×1920, 9:16, 30 FPS |
| Duration options | 15 / 30 / 45 / 60 seconds |
| Colour | Khronos PBR Neutral, look `None` |
| Blender | 4.2.3 LTS |
| Direction | Deterministic; additive NLA (`blend_type = ADD`) |
| Chest seam | `install_shadow_proxy` remains on the accepted path |
| Visual bands | Existing local-acceptance thresholds unchanged |
| Library | Do not replace files under `production-library/` without explicit visual approval |
| Voice | Do not alter voice IDs; do not claim voice lock in this stage |
| Fingerprint | `computeRenderAssetFingerprint()` stays on the pin above |

## Pip (`CHAR_PIP_001`)

Preserve locked DNA: girl chick, golden-yellow, red 3-lobe comb, orange beak/feet, purple backpack + gold star, `pip_default_v1`.

| Measure | Pass condition | Current (audit) |
| --- | --- | --- |
| Identity | Same silhouette class, colors, comb, backpack, star | Locked prototype |
| Mesh fidelity | Sculpted chick, not UV-sphere kitbash; defined beak; wing-arm silhouette | 3800 verts / 4072 polys — needs upgrade |
| Materials | Soft feather read at 1080p close-up; not plastic | Vertex color + Principled; no maps |
| SSS / sheen | Body SSS ≥ 0.18 and sheen ≥ 0.40 without hue drift | Body has SSS 0.18 / sheen 0.40; accessories unset |
| Groom | Cached feather volume (Alembic/USD), not live sim in-shot | Missing |
| Textures | 2K minimum, 4K hero; locked base hues | Missing |
| Rig | Existing 14-bone `Pip_Rig` preserved; eye-aim bones additive only | No eye bones |
| Face | All required shape keys remain; readable at 1080p CU | 43 keys present |
| Chest seam | Shadow proxy still installed; no self-shadow scar | Protected |
| Binding | New `THEATRICAL` binding only after Justin approves a replacement | Absent (fail-closed) |

Forbidden: duck / generic bird / adult chicken / plastic toy / missing comb / missing backpack when traveling / recolour.

## Goat (`CHAR_GOAT_001`)

Preserve locked DNA: boy goat, cream fur, brown horns, blue collar + gold GOAT tag, `goat_default_v1`.

| Measure | Pass condition | Current (audit) |
| --- | --- | --- |
| Identity | Same silhouette class, cream fur, horns, collar, GOAT tag | Locked prototype |
| Mesh fidelity | Sculpted youthful goat; ridged curved horns; large floppy ears; fluffy cheeks/chest/beard | 3848 verts / 4060 polys — needs upgrade |
| Materials | Soft fur read at 1080p close-up; not plastic | Vertex color + Principled; no maps |
| SSS / sheen | Body SSS ≥ 0.20 and sheen ≥ 0.45 without hue drift | Body has SSS 0.22 / sheen 0.48; horns unset |
| Groom | Cached fur volume | Missing |
| Textures | 2K minimum, 4K hero; locked base hues | Missing |
| Rig | Existing 18-bone `Goat_Rig` preserved; eye-aim additive only | No eye bones |
| Face | All required shape keys remain; readable at 1080p CU | 44 keys present |
| Binding | New `THEATRICAL` binding only after approval | Absent (fail-closed) |

Forbidden: sheep / ram / deer / realistic adult / intimidating redesign / missing horns / missing collar or tag / recolour.

## Environments

| Measure | Pass condition | Current |
| --- | --- | --- |
| Meadow | Sculpted terrain (not a 4-vert plane), PBR ground, dressed set that holds 1080p | `meadow_production.blend` — pipeline-ready, not theatrical |
| Creek | `LOC_CREEK_001` authored in-house for later beats | Missing |
| Lighting in set | Motivated practicals authored with the set; do not retune `LIGHTING_STATES` | 3-point + additive no-shadow practicals |
| Provenance | In-house only; no paid HDRI / marketplace kit | Studio only |

## Props

| Measure | Pass condition | Current |
| --- | --- | --- |
| Adventure map | Paper fiber + ink read at 1080p; folds and trail remain recognizable | Multi-mesh, no image textures |
| New props | Versioned under `theatrical-foundation/proposed/` until approved | None promoted |

## Materials and textures

| Measure | Pass condition |
| --- | --- |
| Base color | Locked DNA hues must not drift (Pip gold/red/orange/purple; Goat cream/brown/blue/gold) |
| Metallic | Gold star and GOAT tag stay metallic; characters stay non-metal |
| Maps | No unlicensed / paid textures; local or authored only |
| Resolution | Prototype = vertex color; theatrical = 2K/4K PBR (albedo, roughness, normal, optional SSS radius) |
| Engine | Principled BSDF, Blender 4.2.3 sockets (`Subsurface Weight`, `Sheen Weight`, `Coat Weight`, `Specular IOR Level`) |
| Colour pipeline | Khronos PBR Neutral on every review still |

This stage’s proposed shader file is **look-dev only**. It is not a texture set and is not a canonical replacement.

## Facial performance

| Measure | Pass condition |
| --- | --- |
| Semantics | `jaw_open`, `mouth_smile/frown/pucker/wide`, `blink_left/right`, `eye_look_*`, `brow_up/down` |
| Visemes | REST, A, E, I, O, U, MBP, FV, L, WQ |
| Authored actions | Existing clips remain; overlays stay additive NLA |
| Readability | Expression change visible at 1080p close-up without breaking silhouette |
| Protected features | Beak / horns / comb stay within `maxDeformUnit` |

## Eye performance

| Measure | Pass condition |
| --- | --- |
| Aim | Independent eye aim (bones or equivalent) for motivated gaze | Missing today (shape-key look only) |
| Wetness | Specular / coat so eyes are not dry plastic |
| Catchlight | Existing catchlight meshes remain visible |
| Dead-eye | Neutral stare without a gaze target is a fail on theatrical review |

## Lighting

| Measure | Pass condition |
| --- | --- |
| States | Do not retune measured `LIGHTING_STATES` |
| Practicals | Additive, no-shadow, as Milestone 3 already wired |
| Theatrical set lights | Authored with environments after approval; not a silent replace of key/fill/rim |
| Transform | Khronos PBR Neutral only |

## Reusable VFX

| Measure | Pass condition |
| --- | --- |
| Existing | Seeded, capped, no-shadow EEVEE instances remain valid for Steps 1–8 |
| Theatrical library | Cached reusable clips (dust, sparkle, water) with provenance | Missing |
| Shadows | VFX must not recast character self-shadow / chest-seam defects |

## What this stage may ship without approval

- Inventory and requirements (this folder)
- Proposed shader look-dev **outside** `production-library/`
- Labeled local EEVEE stills for Justin
- Tests that the fingerprint, theatrical gate, and fail-closed bindings are unchanged

## What this stage must not do

- Declare assets approved because tests passed
- Replace canonical Pip / Goat / meadow / map blends
- Add a `THEATRICAL` row to `ASSET_BINDINGS`
- Flip `THEATRICAL_GATE_STATE.assetFoundationComplete`
- Begin Steps 9–16
- Rebuild the worker image, launch a paid GPU, cloud-render, or deploy
