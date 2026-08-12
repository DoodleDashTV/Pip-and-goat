# DDP Rigging & Animation Audit (Side Agent 1)

**Agent:** Rigging & Animation Worker  
**Protected main agent:** DoodleDash Production  
**Branch:** `agent/rigging-repair`  
**Base inspected:** `cursor/canonical-ddp-baseline-ba2f` @ `75fc73a711a4a1680b6220b8a149a1edc96c10a1`  
**Paid GPU:** NO (`CLOUD_RENDER_ENABLED=false`, `ALLOW_PAID_GPU_LAUNCH=false`)

## Scope

Local Pip + Goat rigging/animation only. No lighting architecture, cloud infrastructure, R2 production writes, or integration merges.

## Assets inspected

| Role | Authoritative blend | Production sync copy | Rig | Mesh |
| --- | --- | --- | --- | --- |
| Pip | `assets/characters/pip/pip_v1_1.blend` | `production-library/characters/pip_production.blend` | `Pip_Rig` | `Pip_Character` |
| Goat | `assets/characters/goat/goat_v1_1.blend` | `production-library/characters/goat_production.blend` | `Goat_Rig` | `Goat_Character` |

Canonical IDs preserved: `char_pip_v1` / `CHAR_PIP_001`, `char_goat_v1` / `CHAR_GOAT_001`.

## Rig strategy determination

**Intended strategy: deform rig (hybrid with object-parented accessories).**

Evidence before repair:

- Armature modifiers present on character meshes (`use_vertex_groups=true`, `use_bone_envelopes=false`)
- Mesh parented to armature object (`parent_type=OBJECT`)
- **Zero vertex groups / weighted verts** → modifiers could not deform
- Pose bones used `QUATERNION` while actions keyed `rotation_euler`
- No rigid-part bone parenting (`parent_type=BONE`) and no object-level character animation driving visible body parts

Conclusion: hybrid intent (deform body + accessory objects under the same armature) was implemented incompletely.

## Pre-repair evidence (FAIL)

Fail-closed audit via `scripts/assets/audit_rigging_animation.py`:

| Gate | Result | Evidence |
| --- | --- | --- |
| `RIG_BINDING_VALID` | FAIL | Armature modifiers existed; weighted vertex groups = 0 |
| `ANIMATION_CHANNELS_VALID` | FAIL | Euler fcurves present; pose `rotation_mode=QUATERNION` (mode mismatch) |
| `PIP_MOTION_VALID` | FAIL | `PIP_POINT` maxVertexDelta = 0; static pointed pose + no deform binding |
| `GOAT_MOTION_VALID` | FAIL | `GOAT_HEAD_NOD` Euler delta ≈ 0.50 but evaluated bone tip/mesh deltas = 0 under Quaternion mode + unbound mesh |

Known-issue mapping:

- Pip static → unbound mesh + Quaternion/Euler mismatch + `PIP_POINT` authored as constant pose
- Goat static → unbound mesh + Quaternion/Euler mismatch
- `PIP_POINT` keyed but no meaningful evaluated motion → confirmed (`eulerMaxDelta=0` across keys)
- `GOAT_HEAD_NOD` Euler vs Quaternion → confirmed (`modeMismatchEulerOnQuaternionBones=true`)
- Armature modifiers without usable binding → confirmed
- Camera motion false positive → validator explicitly excludes camera transforms

## Sample frames

Actions are 30 frames. Equivalent sample set used:

`1, 10, 20, 30`

Legacy suggestion `1, 30, 60, 90` is documented but not used for pass/fail: cyclic clips return to rest at frame 30 and hold thereafter, which hides mid-clip motion.

## Minimal safe fix

1. **Rotation mode:** set all pose bones to `XYZ` so Euler action channels evaluate.
2. **Binding:** `parent_set(type='ARMATURE_AUTO')` on character meshes + accessories; keep armature modifiers on vertex groups.
3. **`PIP_POINT` temporal motion:** ease into point pose + secondary wing/head motion (no redesign).
4. **Rebuild actions** in place with Euler modes enforced.
5. **Sync** repaired v1.1 blends into `production-library/characters/*_production.blend`.
6. **Prevent regression** in builders:
   - `scripts/assets/build_character_v1.py`
   - `scripts/assets/polish_character_v1_1.py`
   - `scripts/assets/build_founding_library.py`

Intentionally not changed: materials, proportions, bone names, asset IDs, lighting, cloud/Runpod/R2, assemble/lighting scripts.

## Post-repair validation (PASS)

`scripts/assets/validate_rigging_animation.py` → `artifacts/performance/rigging-audit/validation.json`

| Gate | Result | Evidence |
| --- | --- | --- |
| `RIG_BINDING_VALID` | PASS | Weighted vertex groups present on Pip/Goat (+ production copies) |
| `ANIMATION_CHANNELS_VALID` | PASS | Euler channels + `XYZ` modes + bone-tip motion |
| `PIP_MOTION_VALID` | PASS | `PIP_POINT` maxVertexDelta ≈ 0.070, bone-tip delta ≈ 0.038 |
| `GOAT_MOTION_VALID` | PASS | `GOAT_HEAD_NOD` maxVertexDelta ≈ 0.074, bone-tip delta ≈ 0.043 |

Camera motion is not counted.

## Tooling

- `scripts/assets/audit_rigging_animation.py` — evidence audit
- `scripts/assets/repair_character_rigging.py` — in-place repair
- `scripts/assets/validate_rigging_animation.py` — fail-closed gate runner

## Integration notes for DoodleDash Production

- Review/merge branch `agent/rigging-repair` only via the protected main agent.
- No deployment, secret, DB, or paid-GPU changes in this branch.
- After integration, re-run `blender -b --python scripts/assets/validate_rigging_animation.py`.
