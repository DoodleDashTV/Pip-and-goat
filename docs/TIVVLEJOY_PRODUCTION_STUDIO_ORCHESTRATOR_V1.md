# TIVVLEJOY_PRODUCTION_STUDIO_ORCHESTRATOR_V1

Zero-cost software / contract / simulation only.

This layer does **not** execute Blender, launch GPUs, inspect commercial
scenery bytes, mutate Production, approve assets, or publish episodes.

## What this is

One deterministic orchestrator that can answer:

- what an episode needs
- what is complete
- what is blocked, and by which exact dependency
- which versions/hashes it depends on
- which shots can be planned now
- which shots require human approval or real character rigs
- which assets and voice lines are bound
- which scenes can reuse existing work
- which changes invalidate which outputs
- what can run in parallel
- what a final deliverable must contain
- whether a synthetic season is healthy

## Public API

```ts
buildProductionStudioPlan({
  episodes,
  approvedAssetRegistry,
  voiceReceipts,
  characterReadiness,
  visualApprovals,
  renderBackendReadiness,
  usageHistory,
  continuityFacts,
  deliveryProfiles,
})
```

Returns a planning-only studio plan:

- production state graph
- episode production packets
- continuity issues
- scenery longevity report
- batch plan
- recovery job identities
- QC reports
- delivery manifests
- season health
- `safeNextActions`

No mutation. No execution.

## Pipeline

```
SCRIPT
↓
VOICE RECEIPTS
↓
EPISODE PLAN
↓
WORLD BUILDER
↓
APPROVED ASSET RESOLUTION
↓
CONTINUITY
↓
SHOT ASSEMBLY
↓
BLENDER READINESS
↓
VISUAL APPROVAL
↓
RENDER PREFLIGHT
↓
RENDER RECEIPT
↓
QC
↓
DELIVERY PACKAGE
↓
MANUAL RELEASE
```

## Studio readiness

Useful studio-level states:

- FOUNDATION
- PLANNING_OPERATIONAL
- ASSET_PIPELINE_OPERATIONAL
- SHOT_PIPELINE_OPERATIONAL
- PRODUCTION_ORCHESTRATION_OPERATIONAL
- WAITING_FOR_REAL_ASSETS
- WAITING_FOR_CHARACTER_RIGS
- READY_FOR_CONTROLLED_PRODUCTION_VALIDATION
- PRODUCTION_READY

`PRODUCTION_READY` is extremely conservative. Synthetic fixtures **never**
return it. The current project remains blocked on unresolved Pip/Goat
production rigs, commercial inspection, human visual approval, and paid
render authorization.

## Safe next actions

The engine may say:

- Inspect or approve required scenery source
- Wait for production Pip/Goat rig
- Generate/review confirmed voice line
- Review shot preview
- Paid render authorization required

It never says "Started GPU", "Rendered", "Uploaded", or "Approved" unless an
actual receipt proving that event is supplied. This pass never supplies those
receipts.

## Software implemented vs real production

| Layer | Status |
| --- | --- |
| Software contracts / simulation | Implemented |
| Real production validated | No |
| Real production ready | No |

## Preview

`/production-control` is a Preview-only operator console labeled
`PREVIEW / SYNTHETIC PRODUCTION DATA`.
