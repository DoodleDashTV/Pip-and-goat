# TIVVLEJOY_CINEMATIC_ASSET_RECOVERY_AND_UPGRADE_V4_RESULT

No SHOT_02 rebuild. No lighting polish. No paid compute.

## Intake

- Production `.blend` cap remains 180 MiB in `should_extract_member(..., intake="production")`.
- Local lookdev opt-in: `intake="lookdev"` plus `lookdev_large_source_intake.py`.
- ZIP CRC, path traversal, and script/binary extract blocks stay on.
- Add-ons were inspected only. None were enabled.
- Credentials were not logged. Production object storage was not written.

## Recovered local originals (already owned ZIPs)

| Source | Materialized | Bytes |
|---|---|---|
| Stylized_Forest_Nature_Kit.blend | YES | 470.8 MiB |
| Flora_Mat&GN&Models.blend | YES | 639.0 MiB |
| Rock_Models.blend | YES | 246.4 MiB |
| HDRi sk2/0001.hdr | YES | 67.3 MiB |
| Village Cabin01 ALB/NRM/SPE + Wood/Straw maps | YES | — |
| Cabin01A.blend / Cabin04A.blend | YES | — |

## Recovered catalogued packages (owned private storage, read-only)

| Source | Status | Bytes | SHA256 |
|---|---|---|---|
| SRC_BOTANIQ_FULL_7_2_0 / botaniq_full-7.2.0.paq.zip | RECOVERED | 5153837530 | 72c9bba70ae823d6cce255ef898622205080ad10ec3372f77aa7315320576da4 |
| SRC_3DT_MOUNTAIN_PACK_BLENDER / 3DT_Mountain_Pack_Blender.zip | RECOVERED | 1455791452 | 2233349feddd1e826845448758f45a7a1bd39b3b1c6e9c02978c73824860d38c |

Botaniq Full 7.2.0 contains 1417 native `.blend` files (deciduous 284, grass 173, flowers 169, shrubs 112, coniferous 82, plants 71, mosses 17, forest-floor 9) plus 479 textures. Individual tree blends are 20–80 MiB. The addon was not required to append those files.

3DT native file is `Blender Files/3DT_Pack_Mountains.blend` (1415.4 MiB): 20 mountain meshes × Snow/Grass/Dry = 60 objects, 201 images.

## Quality proofs

- Vegetation crop: `cinematic-asset-recovery-v4/vegetation/VEGETATION_QUALITY_CROP.png`
- Meadow crop: `cinematic-asset-recovery-v4/meadow/MEADOW_QUALITY_CROP.png`
- Cabin source: Cabin04A objects are `Building04_LOD0–3` and `Roof04_LOD0–3`. Roof LOD0 = 2403 verts.

## Water lock

Unchanged: IOR 1.33, transmission 0.80, metallic 0, specular 0.50, 18 cm prism, volume 0.18.
