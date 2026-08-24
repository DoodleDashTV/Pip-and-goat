# TIVVLEJOY_CHARACTER_RIGGING_ANIMATION_DEPARTMENT_V1

Reusable Character Rigging & Animation Department for Goat now and Pip later.

This increment implements the department. It does **not** make Goat production-ready.

## Current status

`GOAT_REAL_ASSET_EXECUTION_BLOCKED`

`Goat_FINN.zip` is not in this environment. Inspection results are not faked. Placeholder meshes are not substituted.

Exact next input:

`production-library/characters/goat/SOURCE/Goat_FINN.zip`

Then create a WORKING conversion copy for the studio Blender pin and run the builder offline.

## What this is

A deterministic, resumable, fail-closed character build pipeline with:

- 26 auditable stages
- machine-readable Goat configuration
- generic skeleton / IK-FK / face / viseme / weight / corrective / secondary architecture
- synthetic viseme timing API (no ElevenLabs)
- 20 validation clips and a deformation pose sheet
- 9:16 1080×1920 @ 30 fps framing checks
- performance profiling that refuses blind decimation
- RunPod/Blender dry-run command construction only
- CHARACTER_MASTER_GATE that cannot false-PASS

## What this is not

- A production Goat rig
- A claim that deformation, render, or export QA passed
- Authorization to launch a paid GPU
- A Pip rig
- A silent Blender 4.3 → 4.2 overwrite of SOURCE

## Copies

| Copy | Path | Rule |
| --- | --- | --- |
| SOURCE | `production-library/characters/goat/SOURCE/Goat_FINN.zip` | Immutable |
| WORKING | `production-library/characters/goat/WORKING/CHAR_GOAT_001_working.blend` | Rig development / conversion copy |
| PRODUCTION | `production-library/characters/goat/PRODUCTION/CHAR_GOAT_001_master.blend` | Only after gates pass |

## Pipeline stages

1. SOURCE_INTAKE
2. SOURCE_HASH_LOCK
3. BLENDER_VERSION_CHECK
4. OBJECT_INVENTORY
5. MATERIAL_INVENTORY
6. TEXTURE_INVENTORY
7. UV_VALIDATION
8. TOPOLOGY_AUDIT
9. SCALE_ORIENTATION_NORMALIZATION
10. CHARACTER_SEMANTIC_MAPPING
11. RIG_GUIDE_GENERATION
12. SKELETON_BUILD
13. CONTROL_RIG_BUILD
14. INITIAL_SKIN_BIND
15. WEIGHT_REFINEMENT
16. FACIAL_SYSTEM_BUILD
17. VISEME_SYSTEM_BUILD
18. SECONDARY_CONTROLS
19. CORRECTIVE_DEFORMATION_BUILD
20. ACCESSORY_BINDING
21. DEFORMATION_TESTS
22. ANIMATION_TESTS
23. PERFORMANCE_PROFILE
24. RENDER_QA
25. EXPORT_QA
26. CHARACTER_MASTER_GATE

Each stage reports `CREATED`, `REUSED`, `UPDATED`, `BLOCKED`, or `FAILED`.

## Topology policy

Preserve deformation quality and visual fidelity first. Do not blindly decimate Goat to the old 15–30k target. Profile first. HERO_MASTER may remain dense. Optimize only when silhouette, UVs, textures, deformation, and facial acting stay equal or better.

## Blender compatibility

Studio pin: **4.2.2 LTS**.

Delivered Goat appears authored in **4.3**.

Rule: detect newer files, never silently downgrade SOURCE, convert into WORKING, report `CONVERSION_COPY_REQUIRED`.

## Blender execution

```bash
blender --background <WORKING.blend> --python scripts/blender/characters/build_character.py -- --manifest config/characters/CHAR_GOAT_001/manifest.json --dry-run
```

Offline without Blender:

```bash
python3 scripts/blender/characters/build_character.py --manifest config/characters/CHAR_GOAT_001/manifest.json --artifact-dir /tmp/tj-char --dry-run
```

Python modules import without `bpy`. Missing `bpy` or missing `Goat_FINN.zip` yields `BLOCKED_REAL_EXECUTION_REQUIRED`, never PASS.

## RunPod execution

This task is dry-run only. The department validates payload, worker command, Blender argv, expected artifact paths, cleanup paths, and `SECURE_GPU_PRESERVED`. It does not launch a pod.

## Failure and recovery

- Missing zip → attach SOURCE and rerun SOURCE_INTAKE.
- Newer Blender file → convert WORKING, keep SOURCE.
- Weight defects → refine programmatically; add correctives only when weights cannot fix the pose.
- Gate failure → stay on WORKING. Do not mint PRODUCTION.
- Rerun is idempotent: unchanged hashed stages are reused.

## Manual override policy

A human can request review. A human cannot force PRODUCTION while real execution, deformation renders, or identity checks are missing. Forced approval flags are recorded and ignored.

## Rig versioning

Goat versions live in `config/characters/CHAR_GOAT_001/manifest.json`:

- `goat.rig.v1`
- `goat.skeleton.v1`
- `goat.face.v1`
- `goat.viseme.v1`
- `goat.weight.v1`
- `goat.animation.validation.v1`
- `goat.export.v1`

## Animation control conventions

- `CTRL.*` = animator-facing
- `DEF.*` = deform bones
- `.L` / `.R` = sides
- Legs and arms expose IK, FK, IK/FK switch, and pole vectors
- Face is a mix of bones, shape keys, and drivers
- Visemes are a compact production set mapped from future line timing
- Secondary motion prefers cheap deterministic controls; simulation is never mandatory

## Quality gates

The locked floor remains `docs/production/TIVVLEJOY_CHARACTER_RIG_ANIMATION_QUALITY_GATE_V1.md`.

No rig becomes PRODUCTION unless deformation, animation, render, export, identity, and human visual approval all pass. Automated tests do not replace human review.

## How Pip plugs in later

Generic modules take `CHAR_PIP_001` configuration. Do not add Goat-only assumptions to:

- `scripts/blender/characters/*`
- `apps/web/src/lib/tivvlejoy-character-rigging-department/{skeleton,controls,weights,visemes,semantic-map}.ts`

Pip-specific future requirements are reserved in `config/characters/CHAR_PIP_001/future.json`. Do not rig Pip until her final returned animation mesh is attached.

## Code map

- TypeScript department: `apps/web/src/lib/tivvlejoy-character-rigging-department/`
- Blender package: `scripts/blender/characters/`
- Goat config: `config/characters/CHAR_GOAT_001/`
- Operator surface: `/character-rigging`

## Reports

- `goat_source_audit.json`
- `goat_topology_report.json`
- `goat_texture_report.json`
- `goat_rig_build_report.json`
- `goat_weight_report.json`
- `goat_face_report.json`
- `goat_viseme_report.json`
- `goat_deformation_report.json`
- `goat_animation_validation.json`
- `goat_performance_report.json`
- `goat_character_master_gate.json`
