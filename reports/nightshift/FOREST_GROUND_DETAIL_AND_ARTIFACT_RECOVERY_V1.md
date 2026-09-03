# Forest ground-detail and artifact recovery V1

Two tasks only. Cinematic lighting not started. Material-readable lighting locked from `FOREST_LIGHTING_COLOR_RECOVERY_CAMERA_PROOF_V3.png`.

`paidCreateCount=0`. `paidSpendUsd=0`.

## Lighting lock (unchanged)

Recorded from V3 and reapplied via `LOCKED_MATERIAL_LIGHTING`:

| Parameter | Value |
|---|---|
| viewTransform | AgX |
| look | None |
| exposure | 1.10 |
| gamma | 1.06 |
| hdriStrength | 0.12 |
| HDRI file | `/tmp/tivvlejoy-owned-light/tj_hdri_diag_8k.jpg` |
| TJ_GoldenSun | energy 5.4, color (1.0, 0.76, 0.55) |
| TJ_SoftFill | energy 520, color (0.82, 0.78, 0.70) |
| TJ_ClearingBounce | energy 210, color (0.78, 0.82, 0.70) |
| TJ_CanopyRim | energy 1.85 |

`lightingBaselinePreserved=true`. No fill-warmth, exposure, HDRI, AgX, or saturation compensation.

## Task 1 — rainbow speck identification

Diagnostic still: `artifacts/tivvlejoy-stagegraph-v1/FOREST_RAINBOW_SPECK_OBJECT_ID_V1.png`

SHA256: `56cdc63ea8e325ac2102f642426b5bb8170921afc31128dd4790946a95d1b23e`

Emission legend on the locked 42 mm camera:

| Color | Class | Count painted | Action |
|---|---|---|---|
| magenta | `TJ_ProdFlower_*` | 14 | hide — these are the midground rainbow specks |
| cyan | EcoKit `Floral_*` | 2 visible | preserve (`y>=18` background cards) |
| yellow | `TJ_CoverLitter_*` ovate | 76 | keep (physical leaves, not specks) |
| orange | photo stamps | 81 | hide in Task 2 |
| lime | `Fallen Leaf_*` | 5 | preserve background / already-hidden leftovers |
| blue | `TJ_ProdLitter_*` | 60 | keep (not the rainbow cause) |
| red | firefly/butterfly cards | 0 | none found |

Cause: `TJ_ProdFlower_*` are 0.22×0.28 decorative flower cards (`bq_Flowers_Diffuse.png`, material `TJ_ProdFlower_V1`, collection `TJ_VENDOR_REFERENCE_ROOT`) left in the production view after EcoKit floral replacement. Missing `bq_Library_Materials.blend` is not the cause of these cards; the cards themselves are the colored specks.

Hidden (only these 14):

`TJ_ProdFlower_00` … `TJ_ProdFlower_13` at y = 3.41, 4.83, 9.48, 3.91, 4.92, 16.61, 16.83, 14.29, 8.67, 15.35, 13.01, 11.25, 6.45, 3.68

Not hidden: trees, Corylus shrubs, Carex/Dryopteris, soil, creek, camera, background EcoKit `Floral_*` / `Fallen Leaf_*` at `y>=18`.

V1 beauty: magenta-like pixels = 0. V3 floor hot-clusters at (253,552) and (547,565) are gone.

## Task 2 — failed micro-dressing only

Before: photographic irregular patches `TJ_CoverLitterPatch_*`, `TJ_CoverMossPatch_*`, `TJ_CoverNeedlePatch_*` sitting on the working soil foundation. Those read as flat gray stamps.

After (soil foundation preserved):

* 81 photo stamps hidden
* 90 physical ovate Corylus/autumn leaf clusters
* 35 needle strips
* 6 low Rhytidiadelphus clumps in damp/rock niches
* 5 extra pebbles
* 10 twigs / spruce fragments

No terrain, creek, camera, lighting, or vegetation-architecture rebuild.

## Proofs (do not overwrite)

| Proof | SHA256 | Class | Reading |
|---|---|---|---|
| OBJECT_ID_V1 | `56cdc63ea8e325ac2102f642426b5bb8170921afc31128dd4790946a95d1b23e` | DIAGNOSTIC | magenta = ProdFlower specks |
| GROUND_DETAIL_V1 | `3013d9beba4a9dd2c18a38b4df33a16cfc6a35664ae335f995e4d6041923fd4f` | PASS | specks gone; gray stamps gone; physical litter/twigs/pebbles readable |
| MATERIAL_RECOVERY_V3 | `204b214d2811c0a9b254ca8b26cfa54b156a4cdb17fee45ee7ebcf3f34b3ce76` | PASS | Same locked-camera production still as ground-detail V1 (pixel MAD=0). Bark/ground/shrub/leaf/grass-fern all PASS. |

All 1280×720, locked camera, 20 samples, unpaid CPU. V1 vs V3 extreme-foreground soil scanline y=680 is identical RGB 129.7/113.2/92.9 — lighting and soil foundation unchanged. Stamp-removal sites around y=635 move from gray ~76–89 to brown earth/litter ~120–139.

## Pass gate

Rainbow specks removed and sourced. Soil still reads as forest earth (khaki/brown, no salmon). Litter is physical ovate debris, not rectangular gray stamps. Moss stamps gone; remaining moss is irregular Botaniq clumps. No alpha ghosts, z-fighting, or obvious repetition at 1280×720. Grass/fern/shrub/bark unchanged and still PASS. Camera, water, terrain, composition, background EcoKit structure unchanged.

## Readiness

`forestMaterialsProductionReady=true`
`forestVegetationProductionReady=true`
`cinematicLightingReadyForAuthorization=true`

`forestLightingProductionReady=false` — cinematic lighting not started and not authorized here.
`forestSceneProductionReady=false`
`finalVideoRenderReady=false`
