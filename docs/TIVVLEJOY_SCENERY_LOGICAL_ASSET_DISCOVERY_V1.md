# TIVVLEJOY_SCENERY_LOGICAL_ASSET_DISCOVERY_V1

One commercial package can contain many production assets.

Discovery emits `assetCandidateId` values derived from `sourceId` plus a stable
internal reference. Original filenames are never final production IDs.

Discovery is not approval. Candidates are not selectable
`ApprovedEnvironmentAsset` records until a human approval receipt exists.

Semantic roles reuse the PR #80 production vocabulary (`BUILDING_HERO`,
`INTERIOR_SHELL`, `MOUNTAIN_BACKGROUND`, and the rest). Classification evidence
must cite geometry, materials, hierarchy, or recorded descriptions. Filename
hints alone are not enough.
