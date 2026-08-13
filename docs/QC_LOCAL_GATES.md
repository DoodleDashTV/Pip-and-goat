# Local QC Gates (Agent 3 — QC & Regression)

Isolated package: `@doodle-dash/qc-gates`

These gates exist to **prevent broken content from reaching paid cloud acceptance**.

They do **not** rewrite Pip/Goat rigging, animation, or lighting systems.

## Gates

| Gate | Meaning |
|------|---------|
| `RIG_BINDING_VALID` | Deformation **or** rigid-part binding; rejects fake unbound armatures |
| `PIP_MOTION_VALID` | Real Pip character motion (not camera) |
| `GOAT_MOTION_VALID` | Real Goat character motion (not camera) |
| `ANIMATION_CHANNELS_VALID` | Rejects constant f-curves, rotation mismatches, keyed-but-unevaluated |
| `LIGHTING_STATE_VALID` | `lightingState.preset` + deterministic production ownership |
| `NO_DUPLICATE_LIGHTS` | Rejects duplicate/cloned production lights |
| `ASSET_HIERARCHY_VALID` | MapMark attachment + character/accessory parenting |
| `SCENE_ASSEMBLY_VALID` | Roles present; multi-object placements intact |
| `LOCAL_VISUAL_ACCEPTANCE` | Local visual acceptance granted only when prerequisites pass |
| `TECHNICAL_RENDER_VALID` | Output/technical integrity only |
| `VISUAL_QUALITY_VALID` | Visual quality separate from technical; camera-only fails |
| `READY_FOR_CLOUD_ACCEPTANCE` | **Fail-closed** aggregate of all above |

## Critical regression

If Pip is static, Goat is static, and only the camera moves:

- `TECHNICAL_RENDER_VALID` may be `PASS`
- `PIP_MOTION_VALID=false`
- `GOAT_MOTION_VALID=false`
- `VISUAL_QUALITY_VALID=false`
- `READY_FOR_CLOUD_ACCEPTANCE=false`

Camera movement must never count as character animation.

## Integration hook for DoodleDash Production

**Do not edit cloud orchestration from this agent branch unless you are the integration owner.**

Consume the local API instead:

```ts
import {
  evaluateLocalQcGates,
  isReadyForCloudAcceptance,
  assertReadyForCloudAcceptance,
} from '@doodle-dash/qc-gates';

// Before any paid cloud acceptance launch:
if (!isReadyForCloudAcceptance(evidence)) {
  throw new Error('Local QC gates blocked cloud acceptance');
}
```

CLI:

```bash
pnpm --filter @doodle-dash/qc-gates evaluate -- --evidence artifacts/qc/evidence.json
# exit 0 only when READY_FOR_CLOUD_ACCEPTANCE=true
# exit 2 when fail-closed

pnpm qc:local-gates -- --fixture camera-only
```

Suggested cloud preflight call site (for the main agent to wire later):

- After local scene evidence is collected
- Before `scripts/cloud/acceptance-launch.ts` / paid GPU path
- Independent of infra gates in `packages/production/src/cloud/preflight.ts`

## Evidence contract

Provide a JSON document matching `LocalQcEvidenceSchema` in `packages/qc-gates/src/types.ts`.

Optional Blender collector (read-only inspection):

```bash
blender -b --python scripts/qc/collect_local_qc_evidence.py -- --out artifacts/qc/evidence.json
```

## Safety

- `CLOUD_RENDER_ENABLED=false`
- `ALLOW_PAID_GPU_LAUNCH=false`
- No R2 production writes
- No Runpod launch from this package
