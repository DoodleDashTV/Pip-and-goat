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
- Slightly harder sun / quieter fill than the hero lock
- Cool rim light-linked to Botaniq heroes only
- 128 spp + OpenImageDenoise for a human-readable still

Does **not** run legacy `apply_cinematic_forest_lighting_repair`. Camera, terrain, water, composition, V3 sky card, hero trees, and dirt-pack dressing stay locked.

## Proof

Pending unpaid render: `artifacts/tivvlejoy-stagegraph-v1/FOREST_ATMOSPHERIC_DEPTH_PROOF_V1.png`
