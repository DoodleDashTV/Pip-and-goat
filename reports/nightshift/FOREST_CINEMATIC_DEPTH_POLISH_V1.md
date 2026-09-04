# Forest cinematic depth polish V1

`paidCreateCount=0`. `paidSpendUsd=0`. No final video. No EP012.

Human review asked for a premium, layered, cinematic still. The atmospheric-depth pass added air but still read grainy and flat. This polish keeps every lock and replaces the noisy slab with layered depth.

Locked stills (unchanged files):

| Proof | SHA256 |
|---|---|
| `FOREST_HERO_TREE_REPLACEMENT_PROOF_V1.png` | `ac00a3aa6cc897b98a59307e2b9c13309bc02781d5fb32b0692d698b3e8cad56` |
| `FOREST_DIRT_PACK_INTEGRATION_PROOF_V1.png` | `127412ca40eb27cdba158ad3bd497cc911d2384c4ada1a503a7d067c05f9fdba` |
| `FOREST_ATMOSPHERIC_DEPTH_PROOF_V1.png` | `e72f098682e9247642a29d4e3de7eb8658aac44562433cf5c87a54988d369a13` |

## Approach

- Thinner gradient volume (0.0024) instead of the 0.0062 fog slab
- Noiseless FG / MG / BG haze cards in front of the V3 sky card
- Harder sun (54) / quieter fill (148) plus a warm path catch
- Stronger hero-only rim
- 192 spp + OpenImageDenoise, finer volume step rate

Camera, terrain, water, heroes, ground packs, and the V3 sky card stay locked.

## Proof

Pending unpaid render: `artifacts/tivvlejoy-stagegraph-v1/FOREST_CINEMATIC_DEPTH_POLISH_PROOF_V1.png`
