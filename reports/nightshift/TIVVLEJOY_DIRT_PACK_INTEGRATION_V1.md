# TivvleJoy dirt pack integration V1

`paidCreateCount=0`. `paidSpendUsd=0`. No final video. No EP012.

Locked visual baseline (unchanged file):

`artifacts/tivvlejoy-stagegraph-v1/FOREST_HERO_TREE_REPLACEMENT_PROOF_V1.png`  
SHA256 `ac00a3aa6cc897b98a59307e2b9c13309bc02781d5fb32b0692d698b3e8cad56`

## Result: PASS

The three ground packs are registered in the purchased-source conditioner, opened in unpaid local Blender, and applied to the existing locked-camera forest floor. Camera, terrain, water, V3 sky card, hero trees, and current dressing stay in place.

| Pack | Registry | Material | Status |
|---|---|---|---|
| TivvleJoy Dirt 4K | `TJ_GROUND_DIRT_4K_001` | `dirt` | selectable + applied |
| TivvleJoy Sparse Grass 4K | `TJ_GROUND_SPARSE_GRASS_4K_001` | `sparse_grass` | selectable + applied |
| TivvleJoy Grass Path 2 4K | `TJ_GROUND_GRASS_PATH_2_4K_001` | `grass_path_2` | selectable + applied |

Official 14-file scenery inventory was not changed. Catalog lives with the other purchased extras in `condition_purchased_source.py` + `ground_pack_intake.py`.

## Proof

`artifacts/tivvlejoy-stagegraph-v1/FOREST_DIRT_PACK_INTEGRATION_PROOF_V1.png`

| Field | Value |
|---|---|
| SHA256 | `127412ca40eb27cdba158ad3bd497cc911d2384c4ada1a503a7d067c05f9fdba` |
| Resolution | 1280×720 |
| Samples | 48, denoise off, unpaid CPU |
| Seconds | 115.5 |
| MAD vs hero baseline | 2.43 |

Do not overwrite the hero-tree PASS still.

## Scanlines

| Window | RGB | R−B | Notes |
|---|---|---|---|
| Sky `[0:80, 500:780]` | 140.7 / 178.2 / 216.3 | −75.5 | Same blue/cloud card as hero PASS |
| Floor `[520:700, 400:880]` | 48.7 / 46.9 / 30.6 | **18.1** | Earth band; not salmon |
| Path center | 42.5 / 42.4 / 27.4 | 15.1 | Worn grass-path lane |
| FG left dirt | 60.0 / 54.9 / 37.4 | **22.6** | Dirt pack readable |
| Magenta-like | 0 | | |

## What landed

- Recovered official 4K members into `/tmp/tivvlejoy-conditioned/ground-packs/` and assembled local recovery zips under `/tmp/tivvlejoy-owned-recovery/ground-packs/`. Exact Codex-library zip SHAs are not reproduced by a fresh zip; blend byte sizes match the intake receipt (`217924`, `216906`, `275931`).
- Blender opened each normalized `.blend` and found vendor materials `dirt`, `sparse_grass`, and `grass_path_2` with texture links.
- Applied those materials to 63 camera-visible `TJ_CoverSoil_*` patches in the path corridor, plus raised pack strips. Existing litter/ferns/Carex/twigs stay (89 dressing objects).
- Material slots: `TJ_Pack_TJ_GROUND_DIRT_4K_001`, `TJ_Pack_TJ_GROUND_SPARSE_GRASS_4K_001`, `TJ_Pack_TJ_GROUND_GRASS_PATH_2_4K_001`.

## Locks

Camera `(0.0, -12.5, 2.15)` 42 mm. Terrain, water, composition, V3 sky card, and hero Fagus/Salix trees unchanged. `finalVideoRenderStarted=false`. `paidCreateCount=0`.

## Next

Do not start final video until a human accepts this still. If the path needs more punch, keep retargeting existing cover soil rather than flooding the floor.
