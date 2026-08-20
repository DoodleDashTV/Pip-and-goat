# TIVVLEJOY_CAPTION_SYSTEM_V1

Caption cue metadata is generated from dialogue receipts. No DoodleDash
wording is introduced. Dialogue wording is formatted, not rewritten.

## Fields

`captionId`, `speaker`, `text`, `startFrame`, `endFrame`, `safeRegion`,
`maxLines`, `readingSpeed`, `captionDependencySha256`.

## QC

Timing, overlap, reading speed, line length, safe area, shot boundary,
speaker changes, text overflow.

Captions must respect the vertical composition profile: face band, story
props, and platform UI overlays via the configured caption band.
