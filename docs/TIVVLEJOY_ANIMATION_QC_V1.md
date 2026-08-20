# TIVVLEJOY_ANIMATION_QC_V1

Checks: rig admitted / version / identity, dialogue timing, viseme confidence, blink, gaze, pose and prop continuity, foot/ground contact, movement speed, turn continuity, gesture/face readability, accessories, camera performance visibility, and animation dependency freshness.

States: `PASS`, `WARNING`, `FAIL`, `NOT_EVALUATED`.

Hard blockers and warnings are separate. Synthetic checks never claim visual deformation success.

## Continuity

Shot-to-shot issues: `POSITION_JUMP`, `FACING_FLIP`, `PROP_TELEPORT`, `GAZE_DISCONTINUITY`, `MOTION_DISCONTINUITY`, `CONTACT_DISCONTINUITY`.

Intentional hard cuts are not flagged without context.

## Cache

Reusable categories are limited to blink patterns, idle foundations, walk/run cycle **semantic** plans, look transitions, and common reaction foundations. Full performances are never blindly reused.
