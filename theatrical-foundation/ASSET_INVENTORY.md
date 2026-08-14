# Theatrical CGI Asset Inventory

**Studio:** TivvleJoy (internal: Doodle Dash / DDP)
**Stage:** `THEATRICAL_ASSET_FOUNDATION` — audit only; **not approved**
**Generated:** 2026-08-14
**Audit source:** `scripts/assets/audit_theatrical_foundation.py` → `artifacts/theatrical-foundation/audit.json`
**Canonical fingerprint (unchanged):** `7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7`

This inventory classifies existing assets. Automated tests passing does **not** make a proposed asset approved.

## Classification legend

| Class | Meaning |
| --- | --- |
| Production-ready (pipeline) | Present, hashed, bound, and used by Steps 1–8 / assemble_scene |
| Reusable | Safe to append in later shots without redesign |
| Needs upgrade | Identity is locked; fidelity is below theatrical CGI |
| Missing | Required by the theatrical milestone and not present |
| Prohibited | Paid, unlicensed, or third-party marketplace assets |

## Production-ready (pipeline)

These files are the locked Steps 1–8 / Milestone 2–3 library. Do **not** replace them without explicit visual approval.

| Asset | Path | SHA-256 (first 16) | Mesh / notes | Theatrical? |
| --- | --- | --- | --- | --- |
| Pip | `production-library/characters/pip_production.blend` | `e15e67364ac1c7b4` | 3800 verts / 4072 polys, 43 shape keys, 14-bone `Pip_Rig`, 7 accessories | **No** — prototype fidelity |
| Goat | `production-library/characters/goat_production.blend` | `e40b341c4a9c0a61` | 3848 verts / 4060 polys, 44 shape keys, 18-bone `Goat_Rig`, collar + tag | **No** — prototype fidelity |
| Meadow | `production-library/environments/meadow_production.blend` | `bdfd0656ff719fb3` | Ground (4 verts), path, flowers, trees, sky | **No** — kitbash meadow |
| Adventure map | `production-library/props/adventure_map.blend` | `c42f8300580e0fb3` | Multi-mesh paper map | **No** — stylized prop |

Bindings (`packages/direction/src/assets.ts`):

- `PIP_PROTOTYPE_BINDING` — `pip_default_v1`, quality `PROTOTYPE`, `immutable: true`
- `GOAT_PROTOTYPE_BINDING` — `goat_default_v1`, quality `PROTOTYPE`, `immutable: true`
- `LOC_MEADOW_001` — `meadow_v1`
- `PROP_MAP_001` — `adventure_map_v1`

## Reusable

Everything in the production-ready table is reusable for Steps 1–8 and for **diagnostic** theatrical previews (append-only).

Also reusable (code / look-dev, not mesh assets):

- `LIGHTING_STATES` in `scripts/blender/assemble_scene.py` (LOCKED_ palettes)
- Additive practicals + seeded VFX from Milestone 3
- Khronos PBR Neutral OCIO (`khronos_pbr_neutral.ocio`)
- Direction consumers (`apply_direction_*`) — do not retune as part of this stage

## Needs upgrade (identity locked)

Upgrade means production fidelity, materials, deformation, expression, and presentation. **Not a redesign.**

### Pip

- Vertex-color / Principled only — **no image textures, no normal maps**
- SSS / sheen sockets are unset (`null` in audit)
- No groom / feather volume (wings are stub meshes)
- No eye-aim bones (look is shape-key only: `eye_look_*`)
- Beak is a compact nub vs. “more defined beak” visual-approval note
- Chest-seam shadow proxy exists and **must stay** (`install_shadow_proxy`)
- Visual-approval v1.1 remaining defects: kitbash spheres, plastic shading, stub wings

### Goat

- Same shader limits (no maps, SSS/sheen unset)
- No fur volume / groom cache
- Horns are simplified vs. “more defined horns”
- No eye-aim bones
- Visual-approval v1.1 remaining defects: plastic shading, simplified horns

### Environment / props / lighting / VFX

- Meadow ground is a 4-vert plane — needs sculpted terrain + PBR ground
- Trees / flowers are low-poly kitbash
- Map prop has no paper fiber / ink texture set
- Lighting is 3-point + rim + fill — theatrical needs motivated practicals *authored in the set*, not just additive empties
- VFX is seeded icospheres — needs reusable library clips (dust, sparkle, water) as cached assets

## Missing

| ID / need | Why it is required | Status |
| --- | --- | --- |
| `LOC_CREEK_001` | Step 9+ creek sequence; listed in `quality.ts` as a later-stage asset | Not in library |
| Theatrical Pip / Goat bindings | `resolveCharacterBinding(..., 'THEATRICAL')` must fail closed until approval | Intentionally absent from `ASSET_BINDINGS` |
| Groom caches (feather / fur) | Production model requirements: Alembic/USD caches, not live simulation | Missing |
| 2K/4K PBR texture sets | Production model requirements | Missing |
| Eye-aim / eyelid bones | Face/eye theatrical requirements | Missing (shape keys only) |
| Feature animation library | Distinct from prototype loops; Steps 9–16 | Missing |
| Proposed mesh sculpts | Out of scope until Justin approves a sculpt pass | Not started |

## Prohibited / unlicensed placeholders

| Item | Rule |
| --- | --- |
| Paid marketplace characters, HDRIs, textures, grooms | Do not purchase or license |
| Third-party “free with unclear license” packs | Do not import |
| RunPod / paid GPU / cloud render outputs used as hero stills | Local CPU / software GL only |
| Replacing `production-library/**` with an unapproved file | Forbidden — changes the approved fingerprint |

Studio provenance is **in-house only**. Proposed work in this stage lives under `theatrical-foundation/proposed/` and is **not** part of the fingerprint pin.

## Proposed (this stage) — not approved

| Item | Path | Label | Recommendation |
| --- | --- | --- | --- |
| Shader look-dev (SSS / sheen / roughness) | `theatrical-foundation/proposed/materials_v0.blend` | proposed upgrade | **Revise** — preview only |
| Preview stills | `artifacts/theatrical-foundation/previews/` | existing / proposed / diagnostic | Review material, not a lock |
| Inventory + requirements | this file + `THEATRICAL_CGI_REQUIREMENTS.md` | documentation | Informational |

No proposed file is a canonical replacement. `THEATRICAL_GATE_STATE.assetFoundationComplete` remains `false`.
