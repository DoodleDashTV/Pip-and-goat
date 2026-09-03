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

All 1280×720, locked camera/lighting, 20 samples, unpaid CPU.

## V4 pixel note

Vision captions kept reporting a salmon horizon on V4. Scanline RGB does not. V2/V3 still have a warm band at y≈447; V4 does not. The remaining V4 failure is chroma crush on the cover soil, not a leftover vendor-plane salmon shader.

## V5 correction (responds to V4 gray soil)

- Raise soil HSV saturation/value and reduce the near-black mix so earth survives cool HDRI/AgX
- Map twigs to Corylus bark, not green `Stem_Diffuse`
- Slightly larger hero litter clusters

`forestMaterialsProductionReady=false`. Lighting stays gated.
