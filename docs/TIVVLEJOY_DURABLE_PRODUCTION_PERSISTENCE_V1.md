# TIVVLEJOY_DURABLE_PRODUCTION_PERSISTENCE_V1

Zero-cost software / contract / local disposable testing only.

This layer stores **identities, references, hashes, revisions, and
operator state** for the PR #82 production orchestrator. It does not
execute Blender, launch GPUs, inspect commercial scenery bytes, mutate
Production, approve assets, or publish episodes.

## What this is

A persistence boundary so TivvleJoy production state can be stored,
restored, versioned, audited, and recovered across browser or server
restarts **without losing** episode, shot, continuity, QC, recovery, or
delivery **references**.

## What this is not

- Browser Preview is **not** durable Production persistence.
- Database-ready does **not** mean a database is connected.
- Stored does **not** mean approved.
- Persisted does **not** mean rendered.
- A render receipt does **not** mean QC passed.
- QC passed does **not** mean published.

## Modes

| Mode | Durable across process restart | Notes |
|---|---|---|
| `PREVIEW_MEMORY` | NO | Usable without a database. Lost on process exit unless exported. |
| `PREVIEW_BROWSER` | Adapter-local only | localStorage / injectable `Storage` / file Map. |
| `PREVIEW_DATABASE` | Only when `configured: true` | Unconfigured reports `NOT_CONNECTED`. No silent fallback. |
| `PRODUCTION_DATABASE` | NO in this increment | Always disconnected. Writes `WRITE_REJECTED`. |

Connection strings are never exposed.

## Durable entities

References and hashes only. No commercial binary payloads.

WORKSPACE, PRODUCTION, SEASON, EPISODE, SCRIPT_VERSION, VOICE_RECEIPT,
APPROVED_ASSET_REFERENCE, LOCATION_INSTANCE, SHOT, PRODUCTION_PACKET,
PRODUCTION_STATE_NODE, PRODUCTION_STATE_EDGE, CONTINUITY_FACT,
BATCH_PLAN, PRODUCTION_JOB, RECOVERY_CHECKPOINT,
VISUAL_APPROVAL_REFERENCE, RENDER_PREFLIGHT_REFERENCE,
RENDER_RECEIPT_REFERENCE, QC_RECEIPT, DELIVERY_PACKAGE, AUDIT_EVENT.

Every record carries `id`, `workspaceId`, `schemaVersion`,
`entityVersion`, `dependencySha256`, `createdAt`, `updatedAt`, and
`revision`.

## Store API

`ProductionPersistenceStore` is the only write path. UI components do
not write arbitrary database rows.

```ts
readWorkspace() / writeWorkspace()
readEpisode() / writeEpisode()
readProductionPacket() / writeProductionPacket()
readStateGraphSnapshot() / writeStateGraphSnapshot()
appendContinuityFacts()
readBatchPlan() / writeBatchPlan()
writeJobCheckpoint()
appendAuditEvent()
writeQcReceipt()
writeDeliveryPackage()
commitAggregate()
```

## Database model

Migration-ready Prisma models (local SQL only):

- `tivvlejoy_durable_workspaces`
- `tivvlejoy_durable_records`
- `tivvlejoy_durable_events`
- `tivvlejoy_durable_snapshots`

No remote migration is applied by this increment. No Production
`DATABASE_URL` is read or written.

## Safety

- No Production database connection
- No paid compute
- No Blender execution
- No commercial scenery bytes
- Secrets and signed URLs are redacted or rejected
