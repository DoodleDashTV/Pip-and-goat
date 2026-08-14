# DDP Rigging & Animation Audit

Audit of the founding Doodle Dash production characters (`CHAR_PIP_001`,
`CHAR_GOAT_001`) covering skinning, rig binding, animation channels and evaluated
motion. Produced with Blender 4.2.3 by `scripts/assets/audit_rig.py`, which fails
closed (exit 2) on any defect below.

Reproduce:

```bash
blender -b -noaudio --python scripts/assets/audit_rig.py -- \
  --blend production-library/characters/pip_production.blend --role pip \
  --out artifacts/rig-audit/pip_after.json
```

## Verdict

| Subject | Before | After |
| --- | --- | --- |
| Pip audit | FAIL (38 findings) | PASS |
| Goat audit | FAIL (38 findings) | PASS |

## What was wrong

Three independent defects stacked up, and each one alone was enough to make every
character render as a still pose.

### 1. No skinning at all

Every character mesh carried an Armature modifier pointing at the correct rig,
but **zero vertex groups**, so the modifier had nothing to act on. `bind_skin`
now computes real weights, and the audit counts vertices that would receive no
weight.

| Mesh | Vertices | Vertex groups before | Vertex groups after | Unweighted after |
| --- | --- | --- | --- | --- |
| `Pip_Character` | 3800 | 0 | 14 | 0 |
| `Pip_Backpack` | 296 | 0 | 1 (rigid, `backpack`) | 0 |
| `Pip_Backpack_Pouch` | 128 | 0 | 1 (rigid, `backpack`) | 0 |
| `Pip_StarCharm` | 20 | 0 | 1 (rigid, `backpack`) | 0 |
| `Goat_Character` | 3848 | 0 | 18 | 0 |
| `Goat_Collar` | 768 | 0 | 1 (rigid, `collar`) | 0 |
| `Goat_Tag` | 64 | 0 | 1 (rigid, `collar`) | 0 |
| `Goat_Tag_Text` | 868 | 0 | 1 (rigid, `collar`) | 0 |

### 2. Every action animated a channel the evaluator ignores

All pose bones on both rigs were left in `QUATERNION` rotation mode while all 31
Pip actions and 32 Goat actions author `rotation_euler`. Blender silently ignores
euler channels on a quaternion bone, so 42 channels per Pip action and 54 per
Goat action were dead on arrival.

The audit reported this as `N channels animate an ignored rotation mode` for
every action in both blends.

### 3. `PIP_POINT` was a constant pose

`PIP_POINT` held 84 f-curves and 2520 keyframes, yet **zero** curves varied: the
authoring helper wrote the same pose on all 30 frames. `GOAT_HEAD_NOD` was nearly
as bad with 108 f-curves and exactly one varying channel.

### Evaluated proof of staticness

With the headline action applied and the depsgraph evaluated at frames 1, 30, 60
and 90, geometry did not move at all:

| Role | Max bone delta | Max vertex delta | Moving bones |
| --- | --- | --- | --- |
| Pip (before) | 0.000000 | 0.000000 | none |
| Goat (before) | 0.000000 | 0.000000 | none |

## The supported rigging strategy

DDP characters use **weighted skin deformation with declared rigid accessories**.
There is exactly one supported model, implemented in `scripts/blender/ddp_rig.py`:

- **Deforming meshes** (`Pip_Character`, `Goat_Character`) are skinned by
  `bind_skin`. One vertex group per deform bone; each vertex is weighted to its
  nearest bone segment with a bounded blend to the runner-up bone. Binding fails
  closed if any vertex would end up with no weight.
- **Accessories** (backpack, pouch, star charm, collar, tag, tag text) are bound
  by `bind_rigid` to a single named bone at full weight. This rigidity is
  intentional and declared in `RIG_PLAN`, not an accident of missing weights.
- **Rotation mode is `XYZ` euler** on every pose bone, chosen because all
  authored actions write euler. `Poser.rot` sets the mode before writing, so a
  euler channel can never be authored against a quaternion bone again.
- **Actions must move.** `author_action` keyframes only the channels the pose
  function actually touches and raises if no channel varies.

## After the repair

| Role | Rig | Bones | Rotation modes | Max vertex delta | Min consecutive delta |
| --- | --- | --- | --- | --- | --- |
| Pip | `Pip_Rig` | 14 | `XYZ` | 0.126589 | 0.052141 |
| Goat | `Goat_Rig` | 18 | `XYZ` | 0.219654 | 0.129035 |

`Min consecutive delta` is the smallest geometry change between adjacent sampled
frames (1→30, 30→60, 60→90). It is enforced because a non-zero total delta alone
would still allow the old failure mode where a 30-frame action finishes in the
first second and the character then freezes. Both headline actions are now
authored across all 90 frames of the shot with a monotonic drift component, so no
two sampled frames can coincide.

## Rendered proof, before and after

The claim "the characters are static" is not an inference from the rig data; it is
measurable in pixels. Both columns below are the same shot rendered locally at
270×480 with a **locked-off camera**, so no camera movement can contribute a
single changed pixel, sampled at frames 1/30/60/90.

| Measurement | Before (`75fc73a`) | After (`HEAD`) |
| --- | --- | --- |
| Moving pixels, frame 1→30 | 0.0% | 3.7% |
| Moving pixels, frame 30→60 | 0.0% | 4.3% |
| Moving pixels, frame 60→90 | 0.0% | 4.3% |
| Active scene lights | 8 | 3 (`DDP_Key`/`DDP_Fill`/`DDP_Rim`) |
| Mean frame luma | 219.6/255 | 147–154/255 |
| Darkest pixel | 172.8/255 | 9–12/255 |
| Mean saturation | 10.4/128 | 37–41/128 |

Before the repair the rendered frames were **bit-identical**: not "subtle" motion,
none. A darkest pixel of 172.8/255 also means literally nothing in the frame was
in shadow, which is what eight stacked lights does.

Reproduce with `pnpm gates:local`; the report lands in
`artifacts/local-acceptance/local_acceptance.json` and the frames it judged in
`artifacts/local-acceptance/keyframes/`.

## Fail-closed conditions

`audit_rig.py` exits non-zero when any of these hold, and `scene_gates.py`
enforces the same invariants on the assembled shot:

1. an Armature modifier exists but the mesh has no usable vertex groups;
2. an action animates channels incompatible with the bone rotation mode;
3. keyframes exist but the evaluated pose never changes;
4. an action is applied but the evaluated mesh geometry stays static;
5. a requested action does not exist in the blend at all (this is how a
   motionless goat shipped: the shot asked for an action the library never had,
   and the assembler silently ignored it).

## Related

- `scripts/blender/ddp_rig.py` — skinning, action authoring, motion evaluation
- `scripts/assets/repair_rigs.py` — idempotent in-place repair of both characters
- `scripts/assets/scene_gates.py` — assembled-shot gates with fault injection
- `scripts/assets/local_acceptance.py` — local CPU render + pixel motion proof
- `apps/web/src/lib/local-quality-gates.ts` — fail-closed gate enforcement
