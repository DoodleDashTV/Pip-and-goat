# Camera floor diagnose V1

Unpaid CPU. `paidCreateCount=0`.

## What the fifth architecture proved

`FOREST_CAMERA_FLOOR_DIAGNOSE_V1.json` after isolate→restore→enforce:

| Object | hide_render | material | verts |
|---|---|---|---|
| `TJ_VendorGround` | false | `TJ_ProdGround_SoilLitterMoss_V1` | 525 |
| `TJ_Atmosphere` | false | `TJ_Atmosphere_Mat` (volume) | 8 |
| `TJ_LookdevGroundPatch` | true | same production material | 4 |

The locked-camera salmon plane is **not** a leftover vendor-color bind. The production material is on the visible subdivided ground.

## Proofs

| Frame | Classification | Why |
|---|---|---|
| Isolated ground V2 (new UV+macro shader) | PASS | Soil/litter/moss/needles still read under studio light |
| Camera V1 | FAIL | Solid salmon; Botaniq understory visible |
| Camera V2 | FAIL | Same salmon plane; added litter decals read as gray tiles (worse) |

Camera V2 SHA256 `b58d3ea9b02a6c4d2d0827cf8cdc1ce2e80aa71096d93377c3d59c39e7c6ce32` 1280×720.

## Root cause (current)

Same shader PASSes at 2 m studio and FAILs at the approved 42 mm grazing camera under locked lookdev lighting (warm sun, AgX 0.65, volume, 28-sample denoise). High-frequency Botaniq albedo does not survive that path. Slot remap, world Position, vendor remap, overlay, and in-place UVs were five strategies. Do not repeat them.

## Excluded experiment

`scatter_camera_footprint_carpet` decals are **not** in production. They made the locked frame worse.

## Next floor attempt if any

Must be a new architecture: real owned Botaniq ground-cover **meshes** that occlude the plane in the camera footprint. Not another plane-shader bind. Lighting remains gated until the locked camera shows a forest floor.
