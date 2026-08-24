# TivvleJoy Character Rig & Animation Quality Gate v1

**Status:** LOCKED AS A PRODUCTION STANDARD

## Purpose

Every production Pip and Goat rig must meet this gate before being admitted to episode production. The standard is a floor, not a ceiling: if the asset, scene, or episode requires a higher standard for visual quality, deformation, acting, performance, or safety, the higher standard applies.

## Core rule

**No character rig is production-ready merely because it can move.** It must pass technical validation, deformation validation, animation/acting validation, render validation, and human visual approval.

## Rig requirements

- Correct character scale and orientation.
- Clean rest pose and stable transforms.
- Production-safe armature hierarchy and naming.
- Reliable FK/IK workflow where appropriate.
- Clean skin weights and deformation.
- Usable controls for body, limbs, head, and character-specific appendages.
- Appropriate constraints, limits, and drivers.
- Facial/expression controls appropriate to the actual mesh.
- Corrective deformation for visible problem poses when needed.
- Character-specific secondary-motion controls where visually important.
- Accessories must be controllable without destructive manual work.
- No unexplained hidden dependencies or broken links.

## Pip-specific quality requirements

- Expressive head/eye/face controls where supported by the mesh.
- Layered wing controls with usable posing and secondary motion.
- Crest/feather controls where needed for readable acting.
- Scarf and backpack/accessory controls.
- Strong silhouette control for fast, readable children's animation.

## Goat-specific quality requirements

- Expressive head/eye/face controls where supported by the mesh.
- Ear controls and readable ear reactions.
- Reliable leg/hoof and body controls.
- Tail controls where present.
- Character-specific squash/stretch or secondary motion where visually beneficial.
- Strong silhouette control for comedy and reaction animation.

## Animation library minimum

Reusable production actions should be created and validated for:

- Idle
- Walk
- Run
- Jump
- Land
- Look/turn
- Point
- Wave
- Laugh
- Surprise
- Confusion
- Excitement
- Fear/startle
- Sadness/disappointment
- Celebration
- Fall
- Recover/get up
- Sneak
- Search/look around
- Character-to-character reaction

Additional actions should be added whenever the actual series needs them. The list above is a minimum library, not a maximum.

## Acting standard

Animation must communicate intent without relying solely on dialogue. Where appropriate, a beat should use anticipation, readable pose changes, eye direction, head/body follow-through, reaction timing, and secondary motion.

For major comedic or emotional beats, animation should be staged so the viewer can understand the action clearly at the target delivery resolution.

## Technical validation gates

A rig/animation build must test for:

- Broken constraints
- Missing or invalid controls
- Bad transforms
- Incorrect scale
- Weight/deformation failures
- Mesh intersections/clipping
- Extreme-pose deformation failures
- Foot/hoof sliding
- Ground-contact failures
- Unintended controller drift
- Accessory detachment
- Animation timing errors
- Camera/framing failures in representative shots
- Render failures

Automated checks are required where practical. Automated passes do not replace human visual review.

## Extreme-pose test suite

Each character must be tested in representative extremes, including:

- Deep crouch
- Full stride
- Jump/airborne
- Landing
- Large head turns
- Large limb bends
- Strong facial expressions
- Character-specific maximum wing/ear/tail/accessory poses
- Fast reaction poses

Any visible deformation defect that materially harms the final image must be repaired or explicitly accepted through the human approval gate.

## Production performance standard

The rig must be practical for the TivvleJoy production pipeline. It should support reusable animation, predictable scene assembly, and batch production without requiring fragile manual repair for ordinary episodes.

Optimization must never be used to excuse visible quality defects in final shots. If a performance optimization would reduce final quality, the higher-quality solution wins unless a deliberate production decision says otherwise.

## Human approval gate

A character may enter production only after:

1. Technical validation passes.
2. Extreme-pose validation passes.
3. Representative animation tests pass.
4. Representative render tests pass.
5. Character-specific visual checks pass.
6. Human visual approval is recorded.

## Quality escalation rule

**V1 is the minimum acceptable standard.** If a future episode, character, camera style, or animation requirement exposes a higher necessary standard, the production team must raise the gate rather than weakening the requirement.

Examples include additional corrective shapes, more sophisticated facial controls, improved secondary motion, stronger acting beats, improved camera staging, or additional automated QC.

## No-bypass rule

The following do not count as substitutes for this gate:

- A successful Blender file save.
- A successful script execution.
- A rig that technically deforms.
- A low-resolution technical render alone.
- Automated tests without visual review.
- Synthetic placeholder characters.
- An unverified asset source.

## Production consequence

Until this gate passes, Pip and Goat remain **RIG_VALIDATION_PENDING** and episode animation/render execution must remain blocked for those characters.

Once the gate passes, the approved rig version becomes the authoritative production input for the character and may be used by the episode animation pipeline.

## Department implementation

The reusable builder that applies this gate is documented in `docs/TIVVLEJOY_CHARACTER_RIGGING_ANIMATION_DEPARTMENT_V1.md`. Goat is not production-ready until real-asset execution passes this gate.
