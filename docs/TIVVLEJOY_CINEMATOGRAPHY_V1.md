# TIVVLEJOY_CINEMATOGRAPHY_V1

`TIVVLEJOY_CINEMATOGRAPHY_SYSTEM_V1` turns a shot intent into a camera plan
that can bind to existing 9:16 templates.

## Calculated fields

`cameraIntent`, `shotSize`, `subjectPriority`, `eyeLine`, `lookRoom`,
`leadRoom`, `headRoom`, `verticalSafeArea`, foreground/midground/background
layers, `depthReadability`, `motionDirection`, `screenDirection`,
`cameraHeightClass`, `lensClass`, `cameraMotion`, focus targets,
`storyPropVisibility`, facial/gesture readability.

`exactCameraTransforms` is always `UNRESOLVED`. No real render.

## Motion

Allowed motions: `STATIC`, `SLOW_PUSH`, `FAST_PUSH`, `SLOW_PULL`, `PAN`,
`TILT`, `TRACK`, `FOLLOW`, `ARC`, `REVEAL`.

Motion requires a story reason (reveal, tension, locomotion, reaction,
scale). A moving streak raises fatigue risk and forces a static recovery so
every shot is not moving.

## Quality targets

`HERO_SHOT`, `STANDARD_SHOT`, `TRANSITION_SHOT`, `BACKGROUND_HEAVY`,
`DIALOGUE_CLOSEUP`, `ACTION_SHOT`. Not every shot is maximum quality.

See `docs/TIVVLEJOY_VERTICAL_COMPOSITION_V1.md`.
