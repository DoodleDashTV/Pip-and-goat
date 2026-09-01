# TIVVLEJOY_V7_BROKEN_SCENE_RECOVERY_AND_CAMERA_C_HERO_PREFLIGHT_V1

Broken-scene recovery. Not a render authorization. PR #169 stays OPEN, DRAFT, UNMERGED, NOT READY.

## 1. Starting branch and SHA

- Branch: `cursor/tivvlejoy-scenery-showcase-30s-v1-73f1`
- SHA: `ebd8188650d0a1581cd8562bebca8aebd95d74f6`

## 2. Final branch and SHA

- Branch: `cursor/tivvlejoy-scenery-showcase-30s-v1-73f1`
- SHA: `cdcf90d17ac556f66519629c6890d3345248d574`

## 3. PR #169 state

OPEN, DRAFT, UNMERGED, NOT READY. No merge. No ready-for-review.

## 4. Exact root causes

1. **EcoKit textures never extracted.** `cinematic_required_extract_v1.extract_required_from_zip` only wrote `Flora_Mat&GN&Models.blend` and `Rock_Models.blend`. Worker `runVisualProof` called that script before Blender. Production `extract_role_limit('forest_ecokit')` was 24; `extract_sort_key` ranks `.blend` first, so at most 18 of 1134 PNGs could land. Flora string table references `//Textures\Tree Trunk_2.png`, `//textures\03-2.png`, `//Textures\Flora_1.png`, `//Textures\Moss_2.png`, `//..\Textures\Tree Trunk_1.png`, and `\Stylised Natural Environment Library\assets library\Grass_3_020.png`. Rock references `//Textures\01-8.png` and `assets library\Rock_Model_Large_010.png`. Those files live in `Stylised EcoKit/Textures/` (27) and `Stylised EcoKit/assets library/` (1107). V4 disk state: blends present, both texture directories absent. Hero `hero_SHOT_02.png` shows a magenta trunk and gray canopy — Blender missing-texture magenta.

2. **`remap_missing_images`** (`showcase_original14_30s.py`) indexes extracted basenames only. Unextracted PNGs cannot remap.

3. **`enable_foliage_alpha`** skipped any object whose name contained `tree` or `canopy`, so `TJ_V3_Tree_*` never got Alpha links.

4. **`retune_cabin_with_source_maps`** injected Mapping scale 0.42 on straw and rewired UVs, producing the lattice roof.

5. **`extract_louis_height_cap(meadow1, 0.22)`** deleted verts with `z < 0.22 * zmax`, then `sit_louis_peak` sat the remaining cap as a floating sheet.

6. **Duplicate terrain:** `TJ_Ground_ValleyFloor_PurchasedMeadow` stayed renderable under `TJ_V3_HeroTerrain`.

7. **Sparse instancing:** `hide_legacy_visuals` hid village trees; V3 planted 8/5/3/10/12 EcoKit trees/ferns/bushes/grasses/rocks.

## 5. Repairs made

- Fail-closed extract of Flora + Rock **and** the complete EcoKit texture trees (1134 PNGs).
- `forest_ecokit` role limit raised to 2000; texture members are required dependencies.
- Deterministic path resolve for `//Textures`, `//textures`, `//../Textures`, and vendor `assets library` paths. No generic fallback textures.
- EcoKit cutout alpha on `TJ_V3_*` (trees included; trunk/bark skipped).
- Straw UV rescale removed; straw alpha connected.
- Louis meadow1 height-cap removed. Duplicate valley floor hidden only because it occupies the same Camera C corridor as the authored V3 terrain.
- Denser Camera C planting: 25 trees, 12 ferns, 10 bushes, 22 grasses, 20 rocks in designed creek/grove clusters. Other five cameras untouched. V3 Comp A unused.

## 6. Purchased-source provenance

| Group | Source | Role | Camera C contribution |
|---|---|---|---|
| EcoKit Flora | `SRC_FOREST_STYLISED_ECOKIT` / `Flora_Mat&GN&Models.blend` | forest_ecokit | Trees, ferns, bushes, grass (`TJ_V3_*`) |
| EcoKit Rock | same zip / `Rock_Models.blend` | forest_ecokit | Creek rocks (`TJ_V3_Rock_*`) |
| EcoKit Textures | `Stylised EcoKit/Textures/` 27 PNGs | forest_ecokit | Trunk, moss, flora atlases |
| EcoKit cards | `Stylised EcoKit/assets library/` 1107 PNGs | forest_ecokit | Leaf/grass/rock cards |
| Village cabins | Original-14 village blender | village_blender | Midground hut |
| Village maps | Cabin01/Wood01/Straw01 ALB/NRM/SPE | village_textures | Cabin materials |
| Water D | village project Water_Mat_1 | village_project | Locked creek |
| Louis | Grassy/Meadow LP | background_mountains | Background mass |
| HDRI | sk2 0001 / Image0001 | sky_hdri | World lighting |

Zip SHA-256: `8370295466ae2255d6e0c0b4b36bb7f8cddbef8e9cdf5e5b847016254073c79a`

## 7. Texture/material audit totals

| Check | Result |
|---|---|
| Missing required texture files | **0** (local extract of the purchased zip) |
| Unreadable image datablocks | NOT_EVALUATED_NO_BLENDER |
| Default pink fallback surfaces | NOT_EVALUATED_NO_BLENDER |
| Default white foliage fallbacks | NOT_EVALUATED_NO_BLENDER |
| Broken opaque alpha cards | NOT_EVALUATED_NO_BLENDER |
| Unassigned visible material slots | NOT_EVALUATED_NO_BLENDER |

## 8. Geometry audit totals

| Check | Result |
|---|---|
| Floating terrain sheets | Code repaired (`extract_louis_height_cap` no longer called on meadow1). Not re-evaluated in Blender. |
| Camera C visible intersections | Duplicate valley floor hidden. Not re-evaluated in Blender. |

## 9. Tests and visual gates

| Gate | Result |
|---|---|
| cinematic_required_extract_v1_test | PASS |
| showcase_original14_select_test | PASS |
| cinematic_visual_gate_contracts_v1_test | PASS |
| cinematic_camera_contract_v1_test | PASS |
| inspect_published_final_image_test | PASS |
| lookdev_large_source_intake_test | PASS |
| Geometry E | PASS (code contract only) |
| Geometry F | PASS (code contract only) |
| Geometry J | PASS (code contract only) |
| Pixel E/F/J | NOT RUN (no Blender) |
| Human visual approval | NOT_PASS |

Automated gates do not grant aesthetic approval.

## 10. Peak RAM and VRAM

- Host: 16014 MiB total, 14780 MiB available, 0 swap.
- Texture extract peak RSS: **33.9 MiB**.
- VRAM: not measured (no GPU session).
- Full scene eval not attempted.

## 11. Local Camera C image paths and SHA-256

None produced. Blender 4.2.2 is not installed. No EEVEE substitute. No upscale.

## 12–17. Authorization / spend / readiness

- Paid CREATE count: **0**
- RunPod spend: **$0.00**
- Live pods: **[]**
- READY_FOR_SINGLE_CAMERA_C_PAID_PROOF_AUTHORIZATION: **NO**
- V7_FINAL_VIDEO_RENDER_READY_AWAITING_AUTHORIZATION: **NO**
- FINAL_VIDEO_RENDER_NOT_AUTHORIZED: **YES**

## Blocker

Published digest `sha256:b66c0a8e…` is now ineligible. It cannot materialize EcoKit textures (embedded extract wrote only two blends). A new FINAL worker image must be published and pinned before any Camera C paid proof. This host cannot load the scene: no Blender binary; Flora 640 MiB plus 1134 decoded PNGs plus Louis exceeds a safe 15 GiB evaluation. Minimum RAM for scene eval: **32 GiB**. Do not reduce assets. Do not launch RunPod.

Human visual approval of a repaired Camera C hero is still required. Do not work the other five shots until Justin approves that hero.
