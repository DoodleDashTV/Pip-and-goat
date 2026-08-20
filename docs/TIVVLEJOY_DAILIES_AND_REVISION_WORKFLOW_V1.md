# TIVVLEJOY_DAILIES_AND_REVISION_WORKFLOW_V1

## Dailies

`TIVVLEJOY_DAILIES_REVIEW_V1` collects `reviewId`, `shotId`,
`shotDependencySha256`, reviewer class, category, note, severity, frame
range, status, created time, and `resolvedByRevision`.

Statuses: `OPEN`, `ACKNOWLEDGED`, `FIX_PLANNED`, `RESOLVED`,
`WONT_FIX_WITH_REASON`. `autoApproved=false`.

Categories: performance, camera, staging, lighting, scenery, continuity,
dialogue, SFX, music, captions, edit, technical, QC.

## Revisions

`TIVVLEJOY_REVISION_REQUEST_V1` is created from a director note and names
exact dependency impact. Example: "Hold Goat reaction 12 frames longer"
affects performance timing, shot animation manifest, edit duration, and
downstream audio/caption timing. Unrelated scenery source hashes stay valid.

Versions are `SHOT_V1`, `SHOT_V2`, … The selected version is an explicit
binding. Mutable `latest` is forbidden.

## Approval matrix

Areas: story, camera, performance, scenery, continuity, audio, editorial,
technical. Final shot approval requires the configured mandatory areas.
Synthetic fixtures cannot become real human-approved FINAL.
`finalApproved` stays false for synthetic matrices.
