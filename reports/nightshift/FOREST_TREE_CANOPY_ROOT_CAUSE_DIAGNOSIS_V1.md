# Forest tree canopy root-cause diagnosis V1

Diagnosis only. No repair. No final video. No paid work.
Camera, lens, terrain, water, composition, ground dressing, and V3 sky were not changed.

Failed beauty proof (unchanged):
`artifacts/tivvlejoy-stagegraph-v1/FOREST_INTERIOR_SUN_CANOPY_STRUCTURE_PROOF_V1.png`
`sha256=8064a223957124fb31370d59219ee1d97904a5c961ecde4c41124d7dd69f797b`

## Result

`executionStatus=PASS` (diagnosis complete and evidence-backed; this is not a visual-beauty PASS)

| Field | Value |
|---|---|
| `visibleTreeObjects` | `Tree_2_005.001`, `Tree_2_003.001`, `Tree_2_003.002`, `Tree_5_004.001`, `Tree_2_005.002`, `Tree_4_006.001`, `Tree_1_004.001`, `Tree_2_005.003` |
| `treeAssetSources` | Stylised EcoKit `Flora_Mat&GN&Models.blend` collections `Tree_1`…`Tree_5` |
| `canopyGeometryType` | `blob_or_large_card` + `large_alpha_cards` (Geometry Nodes stamp clumps) |
| `heroQualityTreesPresent` | `false` |
| `lodOrProxyDetected` | `true` |
| `leafTexturePaths` | `//Textures/Flora_1.png`, `//Textures/Moss_2.png`, `//Textures/firefly_1.png` |
| `leafTextureResolution` | Flora 4096², Moss/firefly 2048² (not missing, not low-res) |
| `materialProblemsFound` | `STYLIZED_GROUP_SHADER_NO_PRINCIPLED`, `DIFFUSE_ONLY_NO_PRINCIPLED`, `NO_IMAGE_TEXTURES` (vines) |
| `lightingBlockersFound` | self-canopy occlusion 7/8, opaque stamp wall, overlay share 0.066, fill flatten, EcoKit LOD used as hero |
| `denoiseOrSampleBlurRisk` | `true` (24 spp + OIDN; secondary) |
| `finalVideoRenderStarted` | `false` |
| `paidCreateCount` | `0` |
| `paidSpendUsd` | `0` |

## Required artifacts

| Artifact | Path |
|---|---|
| Object-ID proof | `artifacts/tivvlejoy-stagegraph-v1/FOREST_TREE_CANOPY_OBJECT_ID_PROOF_V1.png` (`sha256=7c629871ac51e536f975ba75a44b97450ee0392b41400ae0a07808c8825949f3`) |
| Material/texture report | `artifacts/tivvlejoy-stagegraph-v1/FOREST_TREE_CANOPY_MATERIAL_REPORT_V1.json` |
| Camera-frustum list | `artifacts/tivvlejoy-stagegraph-v1/FOREST_TREE_CANOPY_FRUSTUM_LIST_V1.json` |
| Full diagnosis | `artifacts/tivvlejoy-stagegraph-v1/FOREST_TREE_CANOPY_ROOT_CAUSE_DIAGNOSIS_V1.json` |

Object-ID legend (unique Object Color, Standard view, atmosphere/sky-card/gobo hidden for the ID pass only):

| Object | Class | Source | RGB |
|---|---|---|---|
| `Tree_2_005.001` | foreground | Tree_2 | dark brown (left trunk) |
| `Tree_2_003.001` | foreground | Tree_2 | peach / salmon (right trunk + canopy) |
| `Tree_2_003.002` | foreground | Tree_2 | mint (left-center clump) |
| `Tree_5_004.001` | foreground | Tree_5 | cream / hanging stamp cards (right weeping mass) |
| `Tree_2_005.002` | midground | Tree_2 | magenta |
| `Tree_4_006.001` | midground | Tree_4 | blue |
| `Tree_1_004.001` | midground | Tree_1 | yellow clump |
| `Tree_2_005.003` | midground | Tree_2 | lime |
| overlays | — | Corylus cards | cyan |
| `Tree_*` y≥18 | background | EcoKit | dark navy |

## Camera-visible trees

Locked camera `TJ_VendorReference_Camera` at `(0.0, -12.5, 2.15)`, 42 mm, look `+Y`.

48×27 camera rays after skipping the closed `TJ_Atmosphere` box: **651 Tree_*** / **46 overlay** / 497 other / 102 sky. Overlay share of tree+overlay = **0.066**.

| Object | Class | Pack / collection | Distance | Canopy geo | Faces | Median face m² | Hero/mid suitable |
|---|---|---|---|---|---|---|---|
| `Tree_2_005.001` | FG | EcoKit `Tree_2` | 16.0 m | large GN stamp cards | 39182 | 0.35 | **no** — too close |
| `Tree_2_003.001` | FG | EcoKit `Tree_2` | 16.3 m | blob / large card | 33033 | 0.68 | **no** — too close |
| `Tree_2_003.002` | FG | EcoKit `Tree_2` | 20.3 m | blob / large card | 33033 | 0.38 | **no** — too close |
| `Tree_5_004.001` | FG | EcoKit `Tree_5` + vines | 21.2 m | large GN stamp cards | 58796 | 0.16 | **no** — too close |
| `Tree_2_005.002` | MG | EcoKit `Tree_2` | 24.1 m | large GN stamp cards | 39182 | 0.24 | **no** |
| `Tree_4_006.001` | MG | EcoKit `Tree_4` | 25.2 m | large GN stamp cards | 32175 | 0.30 | **no** |
| `Tree_1_004.001` | MG | EcoKit `Tree_1` | 27.9 m | large GN stamp cards | 52052 | 0.13 | **no** |
| `Tree_2_005.003` | MG | EcoKit `Tree_2` | 29.2 m | large GN stamp cards | 39182 | 0.24 | **no** |

Background `Tree_*` at y≥18 stay locked and are the same EcoKit LOD class (also in frustum as navy silhouettes). Do not replace those for this diagnosis.

Vendor previews `Tree_1_001.png`…`Tree_5_001.png` and `Tree_GN_001.png` match the ID silhouettes: flared low-poly trunk + two/three soft green stamp masses. `Tree_GN` is even more blob-like and is **not** a better hero variant.

Every source collection object has a `GeometryNodes` modifier. Production recovery only rebound Tilia bark. Canopies were never replaced.

## Materials and textures

Camera-visible canopy slot is EcoKit `Leaf Blade` (HASHED) using packed `Flora_1.png` 4096² sRGB through `Flora_Shader` group. **No Principled** on that group. Prior lighting passes added a translucent mix, so `hasTranslucent=true`, but that cannot turn stamp blobs into leaves.

`Tree_5_004.001` also carries `Vines_1.001` (diffuse-only, no image), `Vines_1-2.001` (`Moss_2.png` 2048²), `Leaf Blade_1-1.001` (`firefly_1.png` 2048²). Those vines are the only camera-readable “leafy” structure in the failed beauty still.

Trunk slots are `TJ_ProdBark_Tilia_V1` (1024×4096 albedo + normal). Bark maps are fine. The missing warm sunlit side is lighting/occlusion, not a missing bark texture.

Overlay materials (`TJ_CanopyLeafDetail_Corylus_V2`, `TJ_CanopyStructure_Corylus_V3`) **do** have working Principled + alpha + normal + translucency on Botaniq Corylus 2048². They are the right *card* quality and the wrong *coverage*.

Textures are not missing, not low-res, and not in a wild colorspace. The atlas is a stylized Flora stamp, so color variation is a painted clump, not per-leaf.

## Why 587 leaf overlays did not change the proof

Interior structure scatter: **587 leaves + 55 sprites + 21 twigs** on 8 trees, plus afternoon `TJ_CanopyLeaf_*` / `TJ_CanopySprite_*`. Total overlay objects counted: **906**, **22698 verts**.

One EcoKit canopy is 32k–59k faces. Camera rays still hit `Tree_*` first (651 vs 46). Overlay share **6.6%**. Cards were biased off the central sky hole, so they do not replace the masses that silhouette against the sky. Same mid-green, no contrast, swallowed by the clump. Adding more cards cannot fix an asset-class error.

## Why the sun did not reach trunks

Key travel is left-rake `(-0.74, -0.06, 0.67)` toward the sun from trunk midpoints.

| Tree | Sun ray | Blocker |
|---|---|---|
| `Tree_2_005.001` (left FG) | clear | — |
| other 7 FG/MG trees | **blocked** | own `Tree_*` canopy at 0.01–4.0 m |

The one unblocked trunk is the far-left tree. Its sunlit face is the **camera-away −X side**. The camera sees the +Y / inner face, which stays in self-shadow. A harder key and the trunk kicker cannot paint a warm camera-facing bark side through an opaque stamp lid. Wide flood-dapple was already discarded (floor 142, R−B 51.5) and must not be repeated.

Fill (`TJ_SoftFill` 155) plus canopy fill (220) flatten the little directional response that remains. HDRI strength stays 0.12.

## Denoise / samples

Failed beauty: **24 samples, denoising ON**, HASHED alpha. This smears stamp edges into softer clumps. Secondary. Turning denoise off will not turn EcoKit LOD into hero leaves.

## Hero trees on disk

Lookdev intake already lists purchased Botaniq Full deciduous heroes:

- `bq_Tree_Fagus-sylvatica_{A,B,C}_summer.blend`
- `bq_Tree_Salix-babylonica_{A,B,C}_summer.blend`

Searched unpaid extract paths. **None present.** Local Botaniq models: `grass`, `misc`, `mosses-and-lichens`, `plants`, `rocks`, `shrubs` only. `bq_Library_Materials.blend` also missing (known). No other tree `.blend` exists under `/tmp` or the repo.

`heroQualityTreesPresent=false`. They are catalogued as already purchased, not available in this unpaid extract.

## Root cause (one sentence)

The 42 mm camera is hero-framing **stylized EcoKit Geometry Nodes stamp-clump trees** at 16–29 m; lighting and overlay cards cannot invent leaf gaps or a sunlit trunk side that the asset does not have.

## bestRepairPath

Stop overlaying more cards on EcoKit clumps. Replace camera-visible `Tree_*` at **y<18** with already-purchased Botaniq Full Fagus/Salix **if those `.blend` files can be recovered unpaid**. Keep EcoKit `Tree_*` only at **y≥18**. After real leaf-card canopies with gaps exist, retune a camera-side sun so the faces the camera sees, and floor patches, receive light. Raise still samples / disable denoise for the next proof.

Do not change camera, lens, terrain, water, composition, ground dressing, or sky.
Do not start final video.
Do not buy new assets.
`paidCreateCount=0`. `paidSpendUsd=0`.
