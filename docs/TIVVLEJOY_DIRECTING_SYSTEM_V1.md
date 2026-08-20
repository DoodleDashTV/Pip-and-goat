# TIVVLEJOY_DIRECTING_SYSTEM_V1

Director software converts episode intent into beats, shot language, staging,
performance notes, lighting/VFX intent, editorial timing, and a Director
Package.

This layer does not execute Blender, approve scenery, admit rigs, change voice
IDs, or launch paid render.

## Beat director

`TIVVLEJOY_STORY_BEAT_DIRECTOR_V1` maps intent onto:

`HOOK`, `SETUP`, `DISCOVERY`, `QUESTION`, `REACTION`, `DECISION`, `MOVEMENT`,
`REVEAL`, `COMEDY`, `TENSION`, `PAYOFF`, `TRANSITION`, `BUTTON`.

Each beat carries purpose, characters, location, prop, dialogue refs,
required reaction / visual information / audience knowledge, energy, duration
target, cut priority, continuity requirements, and `beatDependencySha256`.
Director notes are excluded from the hash.

## Shot language

`TIVVLEJOY_DIRECTORIAL_SHOT_LANGUAGE_V1` is semantic, not a camera matrix.
Intents include establishing, two-shots, singles, close-ups, inserts, POV,
follow/track, push/pull, reveals, static comedy, silhouette, environment
hero, and location transition.

Each intent describes story purpose, duration range, framing and character
priority, camera-motion class, cut compatibility, and vertical-video notes.
Exact transforms stay `UNRESOLVED`.

## Performance notes

The director supplies emphasis, reaction timing, gaze importance, gesture
size, movement urgency, silence/comedy holds, anticipation, and prop
emphasis. Animation planning remains responsible for detailed semantic
performance. This module does not duplicate the PR #84 animation planner.

## Preview consoles

- `/director-control`
- `/editorial-control`
- `/dailies`
- `/production-control`

All pages show `PREVIEW / SYNTHETIC PRODUCTION DATA`.

Stacked on Draft PR #85 scenery inspection. Do not merge or mark ready from
this document.
