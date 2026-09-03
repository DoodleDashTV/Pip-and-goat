# Forest hero tree replacement V1

Diagnosis confirmed EcoKit `Tree_*` LOD/stamp canopies were standing in as locked-camera hero trees. This pass hides those objects and plants unpaid-recovered Botaniq Full Fagus/Salix summer heroes in the same framing roles.

`paidCreateCount=0`. `paidSpendUsd=0`. No final video.

## Result: PASS

| Gate | Value |
|---|---|
| `heroQualityTreesPresent` | **true** |
| `canopyReadsAsLeavesNotClumps` | **true** |
| `skyIsBlueWithClouds` | **true** |
| `sunnyAfternoonMoodPassed` | **true** |
| `forestInteriorBrightnessImproved` | **true** |
| `warmSunHighlightsVisible` | **true** |
| `dappledGroundLightVisible` | **true** |
| `groundMaterialReadabilityStayedPassed` | **true** |
| `salmonTerracottaVisible` | **false** |
| `magentaLikePixels` | **0** |
| `flatGrayStamps` | **false** |

**Remaining blocker:** none for this pass. The 42 mm sky hole is still much brighter than the interior, so the forest can look relatively dim next to the card. That is sky contrast, not EcoKit stamp lids.

## Proof

`artifacts/tivvlejoy-stagegraph-v1/FOREST_HERO_TREE_REPLACEMENT_PROOF_V1.png`

| Field | Value |
|---|---|
| SHA256 | `ac00a3aa6cc897b98a59307e2b9c13309bc02781d5fb32b0692d698b3e8cad56` |
| Resolution | 1280×720 |
| Samples | 48, denoise off, unpaid CPU |
| Seconds | 112.25 |

Do not overwrite afternoon V1–V3 or interior V1 proofs.

## Scanlines (same windows as interior / afternoon receipts)

| Window | RGB | R−B / B−R | Notes |
|---|---|---|---|
| Sky gap `[500:700, 0:80]` | 140.7 / 178.2 / 216.3 | B−R **75.5** | Bluer/more open than V3 56.5 |
| Floor `[400:880, 520:700]` | **56.2 / 53.5 / 38.3** | R−B **17.9** | Matches afternoon V2 ~57.8 / 18.1; not the discarded flood 142 / 51.5 |
| Upper canopy | 156.0 / 173.2 / 147.3 | R−B 8.8 | Leaf-card green, not a stamp lid |
| Left trunk | 90.3 / 94.6 / 70.1 | R−B **20.2** | Warm camera-facing bark (interior was ~22 luma / R−B 1) |
| FG left bark | 110.3 / 115.2 / 85.8 | R−B **24.5** | Readable sun side |
| Right canopy (Salix) | 134.9 / 149.1 / 111.5 | R−B 23.4 | Weeping leaf cards |
| Sky-like n | 190759 | B−R 68.2 | V3 was ~62k / 62.6 |
| Leaf-like n | 166542 | mean 110 / 123 / 66 | Yellow-green cards |
| Magenta-like | 0 | | |

Interior V1 floor was 42.9 / 40.5 / 30.1. This floor is 56.2 → `forestInteriorBrightnessImproved=true` without over-warming soil.

## What changed

- Recovered owned Botaniq Full summer Fagus A/B/C and Salix A/B from the existing R2 zip (range extract). No purchase. No paid render.
- Hid, did not delete, all EcoKit `Tree_*` (14 objects). y≥18 stamp lids still filled the 42 mm sky hole, so they stay hidden. Botaniq BG trees keep depth.
- Hid interior overlay cards (`TJ_Canopy*`, `TJ_Struct*`) that were skinned onto those EcoKit lids.
- Planted 10 Botaniq heroes in the same FG/MG/BG composition roles, opened slightly so the path and sky hole stay readable.
- After planting, retuned sun/fill only. Added shadowless **light-linked** canopy keys and trunk kickers that receive only `TJ_HeroTree_*`, so leaves and bark can read without flooding the floor.
- Retargeted leftover EcoKit-linked canopy fill/rim and the interior trunk kicker onto the hero receivers.
- Moved interior dapple spots under the replacement lids so one warm path pool can reach the ground.

## Trees

**Hidden EcoKit (14):** `Tree_2_005.001`, `Tree_2_003.001`, `Tree_2_003.002`, `Tree_5_004.001`, `Tree_2_005.002`, `Tree_4_006.001`, `Tree_1_004.001`, `Tree_2_005.003`, `Tree_1_002.001`, `Tree_1_002.002`, `Tree_3_006.001`, `Tree_2_002.001`, `Tree_1_003.001`, `Tree_5_004.002`

**Botaniq used:**
- `bq_Tree_Fagus-sylvatica_{A,B,C}_summer.blend`
- `bq_Tree_Salix-babylonica_{A,B}_summer.blend`

Vendor leaf-card / weeping structure is camera-visible. Right-side Salix reads as hanging cards, not a blob.

## Sky / ground / locks

`TJ_AfternoonSkyCard_V2` preserved. Soft white cloud band remains in the mid-horizon gap. `skyCardPreserved=true`.

Ground stays earthy brown (R−B 17.9). Physical litter/ferns/twigs held. ProdFlower stays hidden. No salmon/terracotta. No gray stamps.

Camera `(0.0, -12.5, 2.15)` look `(0.0, 9.5, 2.6)` **42 mm**. Terrain, water, composition, ground dressing, lighting HDRI 0.12, AgX exposure 1.10 unchanged.

`finalVideoRenderStarted=false`. `paidCreateCount=0`. `paidSpendUsd=0`.

## Next

Do not start final video until a human accepts this still. If a later pass needs more leaf punch, keep using hero-only light linking so the floor stays in the 54–58 / R−B ~18 band.
