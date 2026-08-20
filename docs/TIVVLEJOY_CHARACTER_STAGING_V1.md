# TIVVLEJOY_CHARACTER_STAGING_V1

Staging uses symbolic normalized stage coordinates. It does not invent real
rig measurements.

## Planned

Pip and Goat stage zones, entry/exit points, interaction and conversation
distance, prop anchor, camera-aware blocking, foreground/background
assignment, crossing, screen-direction, walk corridor, reaction position.

## Conversation modes

Pip speaking / Goat listening, Goat speaking / Pip listening, shared
discovery, argument/confusion, joint reaction, map reading, walking
conversation, side-by-side travel, one leading, one following.

The planner prevents constant forward stare, robotic symmetry, character
overlap, and random side-switching.

## Screen direction

`TIVVLEJOY_SCREEN_DIRECTION_CONTINUITY_V1` tracks screen position, travel,
eyeline, camera side, and the established axis.

States: `VALID`, `INTENTIONAL_AXIS_BREAK`,
`AXIS_BREAK_REQUIRES_ESTABLISHING_SHOT`, `INVALID_SCREEN_DIRECTION`.

Integrate with the existing continuity ledger. Unjustified 180-degree flips
fail closed.
