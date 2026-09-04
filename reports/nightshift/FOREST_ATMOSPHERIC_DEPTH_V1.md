# Forest atmospheric depth V1

`paidCreateCount=0`. `paidSpendUsd=0`. No final video. No EP012.

Human review of the dirt-pack still asked for less grain and surrounding light with real depth. The afternoon pass had cleared volume/mist after an earlier gray haze rejection. This pass restores sky-protected atmosphere only.

Locked stills (unchanged files):

| Proof | SHA256 |
|---|---|
| `FOREST_HERO_TREE_REPLACEMENT_PROOF_V1.png` | `ac00a3aa6cc897b98a59307e2b9c13309bc02781d5fb32b0692d698b3e8cad56` |
| `FOREST_DIRT_PACK_INTEGRATION_PROOF_V1.png` | `127412ca40eb27cdba158ad3bd497cc911d2384c4ada1a503a7d067c05f9fdba` |

## Approach

- Warm volume shafts inside existing `TJ_Atmosphere` (box ends before the V3 sky card at y=62)
- Z-depth aerial perspective on mid/far trees, cutoff before 50 m so the sky card stays punchy
- Harder sun (46) / quieter fill (188) than the hero lock
- Cool rim light-linked to the 10 Botaniq heroes
- 128 spp + OpenImageDenoise

Does **not** run legacy `apply_cinematic_forest_lighting_repair`. Camera, terrain, water, composition, V3 sky card, hero trees, and dirt-pack dressing stay locked.

## Proof

`artifacts/tivvlejoy-stagegraph-v1/FOREST_ATMOSPHERIC_DEPTH_PROOF_V1.png`

| Field | Value |
|---|---|
| SHA256 | `e72f098682e9247642a29d4e3de7eb8658aac44562433cf5c87a54988d369a13` |
| Resolution | 1280×720 |
| Samples | 128, OpenImageDenoise, unpaid CPU |
| Seconds | 291.5 |
| MAD vs dirt-pack still | 29.66 |

## Scanlines

| Window | RGB | R−B | Notes |
|---|---|---|---|
| Sky `[0:80, 500:780]` | 132.2 / 172.5 / 211.9 | −79.7 | Blue V3 card still punchy |
| Floor `[520:700, 400:880]` | 54.0 / 54.2 / 36.4 | **17.6** | Earth band; not salmon |
| Path center | 43.6 / 45.6 / 27.9 | 15.7 | Worn lane still reads |
| FG left | 66.5 / 68.6 / 40.8 | 25.8 | Dirt pack + warmer key |
| Magenta-like | 0 | | |

## Locks

Camera `(0.0, -12.5, 2.15)` 42 mm. Terrain, water, composition, V3 sky card, and 10 Botaniq heroes unchanged. `finalVideoRenderStarted=false`. `paidCreateCount=0`.

## Next

Human review. Volume still carries some residual grain; a follow-on cinematic polish can raise shaft quality without washing the sky card. Do not start final video.
