# TivvleJoy forest production pipeline

Actionable notes for the next episode. Zero paid execution unless a later prompt authorizes it.

## Libraries

| Role | Preferred owned source | Rejected for hero use |
|---|---|---|
| Bark | Botaniq `bq_Bark_Tilia-europaea` on a cylindrical unwrap | EcoKit `Tree Trunk_1.png`; object-projected Tilia |
| Shrub | Botaniq `bq_Shrub_Corylus-avellana_A` | EcoKit Flora_1 atlas cards |
| Leaf | Corylus Diffuse keyed off studio-black | EcoKit grayscale Flora_1; opaque-black PNG treated as alpha |
| Grass | `bq_Grass_Carex-oshimensis_A` clumps | EcoKit single-plane grass in foreground |
| Fern | `bq_Plant_Dryopteris-carthusiana_A` | EcoKit fern cards with luma alpha |
| Floor | Soil_Loose + autumn litter + needles + moss | Vendor `groundColor` plane; EcoKit terracotta cards |
| Fallback bark | FNKit `Stylized_Trunk_01` | — |

## Foliage material

1. Append the Botaniq object.
2. Replace linked library slots with a local Principled graph.
3. If the PNG is RGBA but fully opaque, key luma < 18 to alpha (`ensure_cutout_png`).
4. CLIP or HASHED blend; two-sided normal flip; light translucency mix.
5. Albedo sRGB, normals Non-Color.

## Distance tiers

- Hero / foreground (`y < 18` in the current vendor-reference layout): Botaniq volume only.
- Midground: Botaniq instances allowed; EcoKit cards only if the camera cannot read edges.
- Background (`y >= 18`): EcoKit may remain.

## Scene entry

`scripts/blender/stagegraph/vendor_reference_render_v1.py` + `forest_botaniq_production_recovery_v1.py`.

Approved camera: `TJ_VendorReference_Camera` at `(0, -12.5, 2.15)`, 42 mm. Do not move it.

## Proof

```
/tmp/blender/blender --factory-startup -b \
  "/tmp/tivvlejoy-ecokit/Stylised EcoKit/Flora_Mat&GN&Models.blend" \
  --python scripts/blender/stagegraph/forest_botaniq_production_recovery_proof_v1.py -- \
  --source-id SRC_FOREST_STYLISED_ECOKIT \
  --owned-hdri /tmp/tivvlejoy-owned-light/tj_hdri_diag_8k.jpg \
  --out-dir artifacts/tivvlejoy-stagegraph-v1 \
  --samples 24 --bark-kind tilia
```

Add `--camera-proof` only after isolated stills pass. Add `--skip-lookdev-stills` to rerun camera only. Camera output is `FOREST_MATERIAL_RECOVERY_CAMERA_PROOF_V2.png`.

Local CPU cost for that camera still: ~9.5 min, peak ~4.6 GB, 1280×720, 28 samples. Unpaid.

A PNG on disk is not a PASS. Classify from the image.

## Paid render

Forbidden unless the current prompt explicitly authorizes a CREATE. Night-shift default: `paidCreateCount=0`.

## Troubleshooting

| Symptom | Likely cause | Next try |
|---|---|---|
| Vertical bark streaks | Square-atlas UVs + 1:4 Tilia | Cylindrical unwrap, physical V=3.4 m |
| Dark leaf rectangles | Opaque studio-black treated as alpha | `ensure_cutout_png` then CLIP |
| Isolated ground good, camera terracotta | Production shader is on the visible subdivided `TJ_VendorGround` (diagnose JSON). Grazing 42 mm + locked lookdev lighting + denoise flatten Botaniq albedo to salmon. | Do not repeat slot-remap / overlay / UV rebind. Next try: real Botaniq ground-cover meshes that occlude the plane. Lighting stays gated. |
| Linked Botaniq nodes missing | Addon groups not present | Local Principled rebuild |
