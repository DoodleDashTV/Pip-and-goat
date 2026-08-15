# Pip replacement intake

Use this when Justin uploads another Pip 3D model. The current fused Tripo Pip stays preserved. The upload is a **replacement candidate**, not automatic canon.

## One command

```bash
scripts/tivvlejoy/ingest-next-pip.sh /path/to/pip_model
```

Accepted sources: `.blend` `.glb` `.gltf` `.fbx` `.obj` textures, or a `.zip` that contains those files.

Optional provenance:

```bash
PIP_LICENSE="in-house sculpt" \
PIP_ORIGIN="Justin upload 2026-08-15" \
  scripts/tivvlejoy/ingest-next-pip.sh /path/to/pip_model.glb
```

Equivalent Python:

```bash
CLOUD_RENDER_ENABLED=false ALLOW_PAID_GPU_LAUNCH=false \
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \
  python3 scripts/assets/pip_replacement_intake.py ingest /path/to/pip_model
```

## What the command does

1. Copies the file unchanged into `theatrical-foundation/proposed/pip-replacement-intake/inbox/`
2. Records the exact filename and SHA-256
3. Unpacks a ZIP beside the original (never into it)
4. Opens the primary model in Blender 4.2.3 LTS
5. Writes geometry, scale, orientation, texture, rig, and UV reports
6. Renders front, rear, left, right, three-quarter, face, character-right shoulder, character-left satchel, and an 8-frame turntable
7. Fills the reference-comparison checklist as `REQUIRES_JUSTIN`
8. Stops

## What it will not do

- Overwrite current Pip or Goat
- Overwrite the long-wing original split parts
- Write `production-library/`
- Bind `THEATRICAL`
- Merge, retopo, final-rig, or lock textures
- Use paid GPU / cloud render

## After ingest

Open the new package:

- `inbox/<package-id>/reports/COMPARISON_PACKAGE.md`
- `inbox/<package-id>/reports/GEOMETRY_REPORT.json`
- `inbox/<package-id>/reports/COMPARISON_CHECKLIST.json`
- `inbox/<package-id>/previews/`

Justin reviews the stills against the ten binding five-view JPEGs and the conditionally approved long-wing appearance. No further production step starts until that visual approval.

## Host-only (no Blender)

```bash
python3 scripts/assets/pip_replacement_intake.py ingest /path/to/pip_model --skip-blender
```
