# Forest camera ground-cover recovery V1

Unpaid CPU. `paidCreateCount=0`. Lighting not touched. Vendor ground shader not rebuilt.

## Architecture

Separate cover collection `TJ_CAMERA_GROUND_COVER_V1`. Irregular overlapping patches, not a replacement plane.

V4+ sits at `z=0.034` so the dressing is above preserved EcoKit `Floral_*` cards (`z=0.015`, `y>=18`, 100–200 m). Those floral objects are not hidden or edited.

`TJ_VendorGround` remains in the scene with its shader unchanged and `hide_render=True` after cover so the old salmon plane cannot flash through gaps.

## Proofs (do not overwrite)

| Proof | SHA256 | Class | Dominant defect |
|---|---|---|---|
| V1 | `6fb06c0e76dfbf3112648fb283ad37ec3ba7e2f51765ffb5833da669dd5dca29` | FAIL | Cover too narrow; salmon sides/horizon (warmest row RGB 134,82,76, R−B=58); rainbow autumn appends |
| V2 | `fffe871b050db2a18a465e9d94fd78f2e2ee050db1e27c7d1d6db09d2219da78` | FAIL | Horizon salmon band y≈447 RGB 83,46,39 R−B=44 |
| V3 | `93d8bf4634da135d18abe6671e3de525d8d0bd77aa17bac6e6f2b7d04618c12a` | FAIL | Vendor plane hidden; horizon salmon band remains y≈447 RGB 81,49,44 R−B=37 |
| V4 | `ba9c2cbc054fa6839fd05ace65f203c7dc55d57ed080835f1be3ace2e50b8220` | FAIL | Salmon band gone (warmest R−B=6.8). Floor neutral gray ~66,64,67 |
| V5 | `e29450431246b44059577775e4da14ee4c37ce8725c3df1b847a0d87b9d310fe` | FAIL | Salmon 0%. Red hue shift → mauve-gray ~86,74,80. Brown pixels 1% |
| V6 | `ba8b88c0509b65fbfecccf191ad6c327d7ddb75848c1a2bb8f53915d1d0a9d78` | FAIL | Salmon 0%. Native Soil_Loose ratio + value lift. Lower floor ~60,65,57 R−B=2.9. Still not readable earth |

All 1280×720, locked camera/lighting, 20 samples, unpaid CPU.

## Pixel evidence

Soil_Loose raw albedo ~139,123,105 (R−B=34). Isolated lookdev PASS ~99–113,94–107,86–96 (R−B≈18). Locked-camera cover after three grade strategies stays R−B≈1–3.

V2/V3 still have a warm horizon band at y≈447. V4–V6 do not. Vision captions that keep reporting that band on V4+ are wrong; use the scanlines.

## Why this is not another shader remap

The remaining soil/litter gray is the locked lookdev HDRI/AgX/exposure crushing owned brown albedo. Isolated Soil_Loose already PASSed. Further HSV tweaks on the cover layer are arbitrary. Lighting stays gated.

## Locks held

camera / water / terrain topology / lighting / composition / background EcoKit y>=18 / vendor ground shader: unchanged.

`forestMaterialsProductionReady=false`. Do not emit `FOREST_MATERIAL_RECOVERY_CAMERA_PROOF_V3.png` and do not start lighting.
