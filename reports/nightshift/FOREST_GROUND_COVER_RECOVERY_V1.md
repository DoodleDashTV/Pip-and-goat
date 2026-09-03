# Forest camera ground-cover recovery V1

Unpaid CPU. `paidCreateCount=0`. Lighting not touched. Vendor ground shader not rebuilt.

## Architecture

Separate cover collection `TJ_CAMERA_GROUND_COVER_V1`. Irregular overlapping patches, not a replacement plane.

V4+ sits at `z=0.034` so the dressing is above preserved EcoKit `Floral_*` cards (`z=0.015`, `y>=18`, 100–200 m). Those floral objects are not hidden or edited.

## Proofs (do not overwrite)

| Proof | SHA256 | Class | Dominant defect |
|---|---|---|---|
| V1 | `6fb06c0e76dfbf3112648fb283ad37ec3ba7e2f51765ffb5833da669dd5dca29` | FAIL | Cover too narrow; salmon sides/horizon (warmest row RGB 134,82,76, R−B=58); rainbow autumn appends; gray soil |
| V2 | `fffe871b050db2a18a465e9d94fd78f2e2ee050db1e27c7d1d6db09d2219da78` | FAIL | Foreground salmon mostly gone; horizon salmon band y≈447 RGB 83,46,39 R−B=44 |
| V3 | `93d8bf4634da135d18abe6671e3de525d8d0bd77aa17bac6e6f2b7d04618c12a` | FAIL | Vendor plane hidden; horizon salmon band remains y≈447 RGB 81,49,44 R−B=37 |
| V4 | `ba9c2cbc054fa6839fd05ace65f203c7dc55d57ed080835f1be3ace2e50b8220` | FAIL | Salmon band gone (warmest R−B=6.8). Floor reads neutral gray RGB ~66,64,67. Brown soil not readable. Green stem-mapped twigs. |
| V5 | `e29450431246b44059577775e4da14ee4c37ce8725c3df1b847a0d87b9d310fe` | FAIL | Salmon still 0%. Soil still not brown (lower-40% brown=1.0%). Foreground ~86,74,80 mauve-gray after red hue shift. |

All 1280×720, locked camera/lighting, 20 samples, unpaid CPU.

## Pixel notes

Vision captions keep reporting a salmon horizon after V3. Scanline RGB does not on V4/V5. V2/V3 still have a warm band at y≈447; V4/V5 do not.

Soil_Loose raw albedo averages ~139,123,105. Isolated lookdev PASS averages ~99,94,86. Locked-camera cover sits near 50–60 gray. Lighting is crushing chroma; cover grade must preserve the native R>G>B ratio and not darken the map.

## V6 correction (responds to V5 mauve-gray)

- Hue 0.50 (no red shift), sat 1.18, value 1.08
- Light mix toward (0.16, 0.13, 0.09) so blue bounce cannot neutralize earth

`forestMaterialsProductionReady=false`. Lighting stays gated.
