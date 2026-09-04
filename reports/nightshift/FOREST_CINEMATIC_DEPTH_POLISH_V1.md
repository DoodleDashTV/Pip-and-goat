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
- Harder sun (54) / quieter fill (128) plus a warm path catch
- Stronger hero-only rim
- 192 spp + OpenImageDenoise, finer volume step rate
- First polish still lifted the floor too far; retuned cards/fill and dropped shadow lift

## Proof

`artifacts/tivvlejoy-stagegraph-v1/FOREST_CINEMATIC_DEPTH_POLISH_PROOF_V1.png`

| Field | Value |
|---|---|
| SHA256 | `128ff5be9972fcf6a161a81962de45a1af966965e8fe4ca91650426c308d6a0a` |
| Resolution | 1280×720 |
| Samples | 192, OpenImageDenoise, unpaid CPU |
| Seconds | 459.3 |
| MAD vs dirt-pack | 30.53 |
| MAD vs atmosphere | 9.03 |

## Scanlines

| Window | RGB | R−B | Notes |
|---|---|---|---|
| Sky | 143.6 / 177.4 / 213.3 | −69.6 | V3 card still blue |
| Floor | 68.3 / 65.9 / 42.1 | **26.1** | Readable earth; not salmon |
| Path center | 61.1 / 61.1 / 34.7 | 26.3 | Path still intentional |
| FG left | 73.6 / 73.7 / 45.1 | 28.5 | Dirt pack kept |
| Magenta-like | 0 | | |

## Locks

Camera `(0.0, -12.5, 2.15)` 42 mm. Terrain, water, composition, V3 sky card, 10 Botaniq heroes, and ground packs unchanged. `finalVideoRenderStarted=false`. `paidCreateCount=0`.

## Next

Human review of the impress bar. Residual grain can remain in stylized leaf-alpha and the locked horizon band. Do not start final video.
