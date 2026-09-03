# Forest interior sun and canopy-structure repair

V3 sky/clouds were accepted. Human direction: interior still too dark/diffused; canopies still soft clumps.

`paidCreateCount=0`. `paidSpendUsd=0`. No final video.

## Result: FAIL

| Gate | Value |
|---|---|
| `skyIsBlueWithClouds` | **true** |
| `sunnyAfternoonMoodPassed` | **false** |
| `forestInteriorBrightnessImproved` | **false** |
| `warmSunHighlightsVisible` | **false** |
| `dappledGroundLightVisible` | **false** |
| `treeDetailImproved` | **false** |
| `canopyReadsAsLeavesNotClumps` | **false** |
| `groundMaterialReadabilityStayedPassed` | **true** |

**Remaining blocker:** the locked-camera interior is darker than V3 and V2 and still reads dim/overcast. Trunks do not show a warm sunlit side, the floor has no readable sun patches, and the main EcoKit canopy masses still read as soft clumps. Overlay leaf cards (587+55) and a harder key did not penetrate the camera-facing forest enough to flip those gates.

## Proof (do not overwrite V1–V3 afternoon proofs)

| Proof | SHA256 | Floor RGB | R−B | Sky-gap B−R | Class |
|---|---|---|---|---|---|
| Afternoon V2 | `bb66eaf7…8d31ba` | 57.8 / 53.7 / 39.7 | 18.1 | 32.2 | FAIL sky/clouds |
| Afternoon V3 | `988e857e…e83aa` | 54.3 / 50.4 / 37.0 | 17.2 | 56.5 | sky/clouds OK; interior dark |
| Interior V1 | `8064a223957124fb31370d59219ee1d97904a5c961ecde4c41124d7dd69f797b` | **42.9 / 40.5 / 30.1** | 12.8 | **56.5** | sky held; interior darker |

`artifacts/tivvlejoy-stagegraph-v1/FOREST_INTERIOR_SUN_CANOPY_STRUCTURE_PROOF_V1.png`
1280×720, 24 samples, unpaid CPU.

## Sky (kept)

Sky-like pixels n=62713, B−R 62.6 (V3 was 62.8). Gap `[0:80,500:700]` B−R 56.5 matches V3. Soft white clouds remain visible in the mid-horizon band. `TJ_AfternoonSkyCard_V2` preserved. `skyCardPreserved=true`.

## Interior / sun

Harder left-rake sun + quieter fill + trunk-linked kicker + tight spots did **not** produce camera-visible warm trunk sides or dapple. A first attempt that flooded the floor with wide warm area lights raised floor mean to 142 / R−B 51.5 (too hot/flat) and was discarded. This receipt is the raking-sun revision.

Floor 42.9 is below V3 54.3 and V2 57.8 → `forestInteriorBrightnessImproved=false`.

## Canopy

8 `Tree_*` (y<18): 587 ovate leaves, 55 sprites, 21 Botaniq twigs, plus V3 cards. Upper-canopy 8-px contrast fell (7.5 vs V3 9.6). Main masses still read as soft clumps; right-side vines remain the only clearly leafy structure.

## Ground

Earthy brown, not salmon/orange/terracotta (R−B 12.8). Physical litter/ferns/twigs held. Magenta-like pixels = 0. No gray stamps. ProdFlower hidden. Dressing not rebuilt.

## Locks

camera / lens / terrain / water / composition / background `y>=18` / ground dressing / V3 sky card / lighting HDRI 0.12.

`finalVideoRenderStarted=false`. `paidCreateCount=0`. `paidSpendUsd=0`.

## Next

Need a camera-side key that actually hits the visible trunk faces and floor patches without a warm flood, and canopy breakup on the EcoKit clump surfaces that silhouette against the sky hole. Do not start final video.
