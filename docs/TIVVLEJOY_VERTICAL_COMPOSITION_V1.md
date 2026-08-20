# TIVVLEJOY_VERTICAL_COMPOSITION_V1

Primary production format is `1080x1920` / `9:16`.

Core logic reads a profile (`DEFAULT_VERTICAL_PROFILE`) instead of embedding
platform-specific magic numbers. The profile configures top overlay, bottom
overlay, caption band, face band, locomotion footroom, and two-character
stack gap.

## Checks

`FACE_SAFE`, `PROP_SAFE`, `CAPTION_SAFE`, `GESTURE_SAFE`, `ACTION_SAFE`,
`HEADROOM_SAFE`, `FOOTROOM_SAFE`, `SIGNAGE_SAFE`.

## QC defects

`TIVVLEJOY_SHOT_COMPOSITION_QC_V1` flags semantic problems from synthetic
boxes only:

`FACE_TOO_SMALL`, `FACE_OUT_OF_SAFE_REGION`, `PROP_NOT_READABLE`,
`GESTURE_OUT_OF_FRAME`, `TOO_MUCH_EMPTY_SPACE`, `SCREEN_DIRECTION_AMBIGUOUS`,
`SUBJECT_OVERLAP`, `BACKGROUND_COMPETES_WITH_FACE`, `SIGNAGE_OCCLUDED`,
`ACTION_EXIT_NOT_VISIBLE`, `CAPTION_COLLISION`, `DEPTH_FLATTENED`.

No real Pip/Goat imagery is required or generated.
