# Forest cinematic lighting recovery V1

Authorized from head `7497dc9bd0945b5e2777a368683ff6748e993ea7` on passed ground-detail dressing.

`paidCreateCount=0`. `paidSpendUsd=0`. No final video render.

## Baseline preserved

V3 material-readable lock unchanged before cinematic layer:

| Parameter | Value |
|---|---|
| exposure | 1.10 |
| gamma | 1.06 |
| viewTransform | AgX |
| hdriStrength | 0.12 |
| fill | 520 → retuned 440, warm (0.82, 0.78, 0.70) kept |
| bounce | 210, (0.78, 0.82, 0.70) kept |

Ground-detail dressing, hidden `TJ_ProdFlower_*`, and physical litter/moss architecture unchanged.

## Cinematic layer (lighting only)

Scoped module `forest_cinematic_lighting_recovery_v1.py` on top of V3 lock:

* side-key sun 7.4 W, warm (1.0, 0.82, 0.62)
* cool rim 2.85 for canopy separation
* canopy fill/rim rig (`forest_canopy_lighting_repair_v1`)
* atmosphere volume + compositor mist
* flora AO / treeleaf / foliage translucency tuning
* AgX Base Contrast look (exposure/gamma unchanged)

Did **not** run legacy `apply_cinematic_forest_lighting_repair` (no world HDRI rebuild, no ground lookdev, no trunk shader rebuild, no exposure cut to 0.38).

## Proof

| Proof | SHA256 | Class |
|---|---|---|
| `FOREST_CINEMATIC_LIGHTING_CAMERA_PROOF_V1.png` | `454ab2c58025cf7a6c1dd70bd23432bd8b68cbccc350828385caee266347af2a` | PASS |

1280×720, locked 42 mm camera, 24 samples, unpaid CPU, ~178 s render.

## Pixel vs baselines

| Still | Floor mean RGB | R−B | Reading |
|---|---|---|---|
| Ground detail V1 | 98.9, 89.9, 68.9 | 30.0 | material-readable baseline |
| Cinematic V1 | 60.3, 55.7, 41.3 | 19.0 | darker foreground under side-key + mist; still earthy |
| Legacy cinematic V3 | 19.6, 18.8, 2.5 | 17.1 | crushed / unusable reference |

Magenta-like speck pixels: 0. Locks held (camera, terrain, water, composition).

## Readiness

`forestLightingProductionReady=true`
`cinematicLightingReadyForAuthorization=true` (authorized and completed)
`forestSceneProductionReady=false` — final video not started
`finalVideoRenderReady=false`
