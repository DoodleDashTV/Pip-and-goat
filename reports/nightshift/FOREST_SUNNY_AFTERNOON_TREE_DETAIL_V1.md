# Forest sunny-afternoon tree-detail recovery

Human review rejected `FOREST_CINEMATIC_LIGHTING_CAMERA_PROOF_V1.png` (gray sky, soft clumped canopies, not a sunny afternoon) and V1/V2 of this pass (pale sky, no visible clouds, canopies still clumped).

`paidCreateCount=0`. `paidSpendUsd=0`. No final video.

## Result: FAIL

| Gate | Value |
|---|---|
| `skyIsBlueWithClouds` | **true** |
| `sunnyAfternoonMoodPassed` | **false** |
| `treeDetailImproved` | **false** |
| `groundMaterialReadabilityStayedPassed` | **true** |

**Remaining blocker:** the locked-camera proof now shows a richer blue sky with visible soft white clouds, but it still does not read as a pretty sunny afternoon. Forest interior lighting is still too dark/diffused (floor slightly darker than rejected V2; trunks and ground lack warm sun highlights), and the main canopy masses still read as soft clumped volumes. Leaf-card overlays help some edges and the right-side vines only.

## Proofs (do not overwrite)

| Proof | SHA256 | Sky gap `[0:80,500:700]` RGB | B−R | Class |
|---|---|---|---|---|
| V1 | `715842a5883ebb408625e7c5d927d0a5893320c49e4797d6a1d630b2fd44fff3` | 128.5, 151.1, 170.6 | 42.1 | FAIL — blue present but pale; canopy still soft |
| V2 | `bb66eaf79eb8422260fce5be8245fad8990a616ea90f65e2a075c2f9678d31ba` | 154.6, 172.8, 186.8 | 32.2 | FAIL — brighter/bluer gap, clouds not readable; canopies clumped |
| V3 | `988e857ea7b0c9820b551b106c95661c840182b257511616fc82d7561ace83aa` | 104.5, 138.9, 161.0 | **56.5** | FAIL — stronger blue + visible clouds; mood and canopy gates still fail |

Locked 42 mm camera, 1280×720, 24 samples, unpaid CPU.

## V3 sky measurement vs V2

Sky-pixel mask: `B−R > 40` and `B > 140`.

| Sample | V2 | V3 |
|---|---|---|
| Window `[0:80,500:700]` B−R | 32.2 | **56.5** (stronger blue; mean darker because more green fringe in the window) |
| All sky-like pixels | n=32098, RGB 172.7/195.2/225.9, B−R 53.2 | n=64632, RGB 149.7/182.1/212.5, B−R **62.8** |
| Top 80 rows sky-like | n=15570, B−R 47.3, RGB 190.5/209.9/237.7 (washed) | n=16425, B−R **78.8**, RGB 131.4/171.5/210.3 |
| Horizon band rows 300–450 sky-like | n=12348, B−R 58.0 | n=44966, B−R 56.1 (much more sky area) |

V3 sky is not overexposed (max RGB 222/223/225). V2 top-gap sky was washed toward white (237 B).

## Clouds visible in the rendered proof

**Yes — in the camera PNG, not only in world settings.** The mid-horizon sky band (the large gap between midground trunks and the distant tree line) shows a medium blue field with large soft white cloud puffs. Those forms come from a UV-mapped camera-only sky card at `(0, 62, 16.5)` using `/tmp/tj_afternoon_sky_card_v2.png`. Stretching EcoKit `Sky_World_2` as an equirect/world map was what made V2 pale and V3-attempt-1 streaky; the card is a painted rich-blue field with puffs placed in the UV band this camera actually hits.

## Canopy comparison vs V2

V3 placed 136 Corylus ovate leaves + 107 alpha sprites on 8 `Tree_*` objects with `y < 18` (ground not touched). Right-side vines and some canopy edges now show individual leaf-card shapes. The main left/center canopy masses still read as soft dark-green clumps. Local 8-px contrast on the upper canopy did not increase vs V2. `treeDetailImproved` stays false.

## Ground readability

| Sample | V2 | V3 |
|---|---|---|
| Floor `[560:700,180:1100]` | 57.8 / 53.7 / 39.7, R−B 18.1 | 54.3 / 50.4 / 37.0, R−B **17.2** |

Earthy brown, not salmon/orange/terracotta. Physical litter, twigs, ferns, pebbles still present. No flat gray photo stamps. Magenta-like pixels `(R>180 & B>180 & G<120)` = **0**. ProdFlower cards stay hidden. Floor is slightly darker than V2, which is why mood still fails.

## What changed in V3 (locks held)

- UV-mapped camera-only sky card; lighting HDRI strength stays 0.12
- Afternoon sun/fill/rim retune; exposure stays 1.10
- Canopy material contrast/roughness/normal lift; Corylus leaf-card overlays on canopies only
- Mist/volume haze remains off
- Camera, lens, terrain, water, composition, background `y>=18` forest, ground dressing, ProdFlower hide unchanged

## Required confirms

- `finalVideoRenderStarted=false`
- `paidCreateCount=0`
- `paidSpendUsd=0`
- no magenta/rainbow specks
- no flat gray stamps
- no `TJ_ProdFlower_*` reintroduced

## Next

Need warmer, readable sun on trunks/shrubs/ground without washing the sky, and more leaf-card breakup inside the main canopy masses (not only edges). Do not start final video.
