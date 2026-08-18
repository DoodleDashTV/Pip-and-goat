# TivvleJoy Scenery Foundation

Checkpoint: `TIVVLEJOY_SCENERY_FOUNDATION_V1`

This is the planning, catalog, and dry-run assembly framework for future TivvleJoy environments. It does **not** integrate purchased Village, SkyMachine, Stylized Forest, EcoKit, or HDRI bytes. Those files were not present in the workspace and were not inspected.

## Architecture

- `apps/web/src/lib/scenery/` — typed registry, catalog, recipes, planner, texture policy, validation, dry-run reports
- `scripts/blender/scenery_inspect.py` — inspection entry point (dry-run safe)
- `scripts/blender/scenery_assemble.py` — assembly entry point (dry-run safe)
- `/scenery` — Preview Only / No Render workspace
- Existing `scripts/blender/assemble_scene.py` is unchanged and remains the Pip/Goat meadow production assembler

## Asset-storage policy

Large licensed assets belong in durable private object storage, not normal Git history.

Prefix:

```
tivvlejoy-assets/
  source/
  quarantine/
  inspection/
  normalized/
  proxies/
  previews/
  catalogs/
  scenes/
  licenses/
  reports/
  validation/
```

Asset intake reuses the existing private R2 / `OBJECT_STORAGE_*` configuration. See `docs/TIVVLEJOY_SCENERY_ASSET_INTAKE.md`. Do not create a second bucket.

Git LFS is not enabled for this work.

## Source-to-normalized lifecycle

1. `registered` — collection described in the source registry
2. `source_unavailable` — bytes are not in the workspace (current purchased default)
3. `awaiting_inspection` — files materialized locally or in private storage, not yet inspected
4. `inspected` — Blender inventory + SHA-256 recorded
5. `normalized` — copies written only to `tivvlejoy-assets/normalized/`
6. `quarantined` — failed validation
7. `approved` — inspected, licensed, and allowed for planning

Purchased sources stay `source_unavailable` until real files are present and inspected. SHA-256 fields stay empty until then.

## How purchased files will be materialized

1. Upload the licensed packages to the private bucket under `tivvlejoy-assets/source/<collection>/`.
2. Attach the license PDF under `tivvlejoy-assets/licenses/`.
3. Materialize a working copy to the local path recorded on the source record.
4. Run inspection. Do not commit ZIP, HDRI, texture, PSD, FBX, Unity, or large `.blend` files to Git.

## Commands

Inspection (dry-run):

```
blender -b -noaudio --python scripts/blender/scenery_inspect.py -- \
  --source-id SRC_VILLAGE_ENV \
  --source tivvlejoy-assets/source/village/Assembled\ Project\ File.blend \
  --report tivvlejoy-assets/validation/village-inspect.json \
  --normalize-out tivvlejoy-assets/normalized/village \
  --dry-run
```

If Blender is absent, `python3 scripts/blender/scenery_inspect.py ... --dry-run` still writes a `realExecution: not_run` report.

Normalization writes only to `--normalize-out`. It never overwrites the purchased source.

Catalog generation uses inspected normalized records. This increment ships a synthetic fixture catalog only (`SRC_FIXTURE_SYNTHETIC`). It contains no commercial geometry.

Recipe creation lives in `apps/web/src/lib/scenery/recipes.ts`. Recipes select by role and tag, not Blender object filenames.

Scene-plan generation:

- Input: scene brief (`recipe`, characters, features, `seed`)
- Output: deterministic placements, camera, lighting, texture tier, provenance
- Same catalog + brief + recipe + seed reproduces the same plan

Dry-run assembly:

```
python3 scripts/blender/scenery_assemble.py \
  --plan tivvlejoy-assets/catalogs/plan.json \
  --output tivvlejoy-assets/scenes/forest-village-v1.blend \
  --report tivvlejoy-assets/validation/assemble.json \
  --dry-run
```

Real assembly prerequisites:

- Inspected normalized assets for every selected role
- Provenance / license records
- Supported Blender 4.2.2
- Versioned output path (never overwrite an approved scene in place)
- Explicit confirmation that this is not a paid render

## Quality gates

Validators cover missing source/texture, invalid catalog, unsupported Blender, missing roles, stage bounds, character clearance, camera occlusion, floating assets, scale, intersections, repeats, triangle and texture memory budgets, provenance, seed, determinism, unapproved use, and 9:16 safe composition.

Mesh-accurate intersection and occlusion require Blender. This pass uses dry-run bounds fixtures and reports that limitation.

## Rollback

1. Leave purchased files in private storage.
2. Revert this branch or delete `/scenery` planning outputs.
3. Do not restore binaries into Git.
4. Do not touch `production-library/`, Pip, Goat, voices, or existing Draft PRs.

## Licensing / provenance

No purchased asset may be approved without a license/provenance reference and an inspected SHA-256. The fixture catalog uses `FIXTURE_SYNTHETIC_NO_COMMERCIAL_GEOMETRY` and is test-only.
