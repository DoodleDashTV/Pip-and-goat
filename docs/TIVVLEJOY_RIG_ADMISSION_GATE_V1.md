# TIVVLEJOY_RIG_ADMISSION_GATE_V1

States:

`RIG_NOT_PRESENT` → `RIG_DISCOVERED` → `RIG_INSPECTION_REQUIRED` → `RIG_CAPABILITY_CHECK_PENDING` → `RIG_CAPABILITY_INCOMPLETE` / hash / version mismatch → `RIG_VISUAL_TEST_REQUIRED` → `RIG_HUMAN_APPROVAL_REQUIRED` → `RIG_APPROVED_FOR_ANIMATION`

`RIG_BLOCKED` is terminal until the operator changes identity, compatibility, or evidence.

## Rules

- No auto approval.
- Synthetic fixtures can never receive real human approval.
- Filename matching is not identity.
- Blender compatibility, required controls, deformation evidence, test-pose evidence, and character identity must all be present.

## Inspection and test poses

`TIVVLEJOY_RIG_INSPECTION_REPORT_V1` validates armature/control/shape-key/constraint evidence **without running Blender**.

Synthetic Pip and Goat inspection reports stay `synthetic: true` and `blenderExecuted: false`.

The test-pose matrix defaults to `NOT_TESTED` for synthetic data.
