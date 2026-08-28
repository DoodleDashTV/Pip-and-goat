# TIVVLEJOY_REAL_SCENERY_30S_V2_FAILURE

One authorized V2 CREATE. No retry.

## Exact failing stage
`STARTUP_WATCHDOG` after 30 minutes. Run `33127365128`.

Pod `oh4r9ltgb9mxh9` stayed `RUNNING` with `runtime.uptimeInSeconds=null` from `2026-08-27T23:45:04Z` until cleanup at `2026-08-28T00:15:55Z`. The Node entrypoint never started, so `PROCESS_STARTED` was never written.

## CREATE
- Authorization: `TIVVLEJOY_SCENERY_SHOWCASE_30S_PAID_EXECUTION_AUTHORIZATION_V2`
- Workflow: TivvleJoy Real Scenery 30s Paid Render V2
- Launch endpoint: `/api/scenery/showcase-30s-v2` only
- schema: `TIVVLEJOY_SCENERY_SHOWCASE_30S_LAUNCH_V3`
- createEntered: true
- createRequests: 1
- retryCreate: false
- workerImage: `...@sha256:7e8bf43653ebd81d1f3fd4452bb2181a1dc11fd97c0ee69789d67b072eebf673`
- workerEntrypoint: `scenery-showcase-entry-v2.js`
- runtimeDockerArgsRequired: false
- dryShowcaseBaked: true
- GPU: SECURE RTX 4090
- rate: $0.74/hr
- stock: Medium

## Evidence
- PROCESS_STARTED written: no
- startup-status.json written: no
- status.json written: no
- Blender launched: no
- frames produced: 0
- MP4: none
- container logs: unavailable after terminate; RunPod never reported runtime uptime

## Cleanup
- matchedBefore: 1
- terminatedCount: 1
- remainingActiveExactName: 0
- billingCleanupConfirmed: true
- recheck: 0 pods, exact-name 0

## PR #169
OPEN / DRAFT / UNMERGED / NOT READY

## Next concrete fix
The V2 worker never reached process start. The 30-minute watchdog is still shorter than a cold GHCR pull of the Blender 4.2.2 base on this 4090 node, or RunPod never started the container. Next authorized run must prove image-pull completion (or use a pre-warmed / smaller image) before another CREATE.
