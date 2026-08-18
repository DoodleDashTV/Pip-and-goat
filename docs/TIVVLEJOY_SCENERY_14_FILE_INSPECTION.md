# TivvleJoy scenery 14-file inspection

Checkpoint: `TIVVLEJOY_SCENERY_14_FILE_INSPECTION_V1`

Stacked on Draft PR #47 (`cursor/tivvlejoy-scenery-pipeline-hardening-73f1`). Keep earlier scenery PRs open, draft, and unmerged. Production is not retargeted.

Justin confirmed the purchase website delivered exactly 14 original files. Internal files inside those archives are not missing downloads.

## Confirmed source downloads

1. Giveaway_World Shaders.zip
2. Village (Textures).zip
3. Village (Blender 4.2.2).zip
4. Village - HDRP (Unity 2022.3.16f1).unitypackage.gz
5. Village - URP (Unity 2022.3.16f1).unitypackage.gz
6. Village - Built-in (Unity 2022.3.16f1).unitypackage.gz
7. Village (FBX).zip
8. Extra Update 1.zip
9. HDRi_JPG_Pack.zip
10. SkyMachineV1.zip
11. SkyMachineV2.zip
12. Project File.zip
13. Stylised EcoKit.zip
14. Stylized_Forest_Nature_Kit.zip

Expected source downloads: 14. When all confirmed manifests exist: uploaded 14, verified 14, missing 0, confirmed duplicates 0, quarantined 0.

## Collections

- Village: 7 official downloads
- Sky/HDRI: 4 official downloads
- Stylized Forest/EcoKit: 2 official downloads
- World Shaders: 1 official download

Former 27-file and 30-file internals (`sk1.zip`, texture tiers, EcoKit `.blend` files, `HDRI_Part_2.zip`, and similar) remain archive-content expectations only.

## Inspection states

`uploaded`, `size_verified`, `inspection_pending`, `inspecting`, `inspection_complete`, `inspection_blocked`, `quarantined`, `blender_import_ready`, and `preservation_only` stay distinct. Upload is not verification. Verification is not inspection. Inspection is not approval.

## Safety

- Preview only. Existing server-side R2 configuration is reused.
- Tokens, R2 keys, signed URLs, and storage credentials are never printed or placed in `NEXT_PUBLIC_` variables.
- Archives are listed with streaming or bounded-memory reads. Traversal, absolute paths, executables, encrypted entries, zip bombs, and unreasonable entry counts are refused.
- `.unitypackage.gz` originals stay unchanged and preservation-only.
- `.blend` embedded scripts are never executed. If Blender 4.2 is unavailable, Blender-specific results are reported as blocked, not invented.
- Licensed binaries stay out of Git. Production is untouched.

## Reports

Machine-readable reports live under `reports/catalog/`, not inside Production asset folders.
