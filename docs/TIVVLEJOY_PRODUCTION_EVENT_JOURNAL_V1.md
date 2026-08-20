# TIVVLEJOY_PRODUCTION_EVENT_JOURNAL_V1

Append-only sanitized events for every meaningful production-state change.

## Event fields

`eventId`, `workspaceId`, `entityType`, `entityId`, `eventType`,
`previousRevision`, `nextRevision`, `dependencySha256`, `payloadSha256`,
sanitized `payload`, `timestamp`, `actorClass`, `reason`.

## Event types

EPISODE_CREATED, SCRIPT_VERSION_BOUND, VOICE_RECEIPT_BOUND,
ASSET_RESOLUTION_BOUND, CONTINUITY_FACT_ADDED, SHOT_DEPENDENCY_CHANGED,
PRODUCTION_PACKET_COMPILED, VISUAL_APPROVAL_RECORDED,
JOB_CHECKPOINT_WRITTEN, QC_RECEIPT_RECORDED, DELIVERY_PACKAGE_COMPILED,
STATE_GRAPH_SNAPSHOTTED, BATCH_PLAN_WRITTEN, WORKSPACE_SAVED,
BACKUP_EXPORTED, WRITE_FAILED.

## Fail-closed sequence checks

- duplicate event
- missing event / revision gap
- out-of-order revision
- corrupted payload hash
- invalid snapshot

Replay: **latest valid snapshot + events after that snapshot =
current durable state**. The same event sequence is deterministic.

Secrets, signed URLs, and raw commercial metadata are not journaled.

Incomplete writes append `WRITE_FAILED` and keep the last valid data
revision. They do not publish half-written records.
