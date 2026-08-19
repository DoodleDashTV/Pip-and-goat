# Paid smoke attempt #2 result

FINAL RESULT: `PAID_SMOKE_TEST_PASS`

Authorization on Draft PR #65 was consumed by the first `POST /v1/pods`.
No second create. No paid retry.

## Identity

- template: `34a9iknfuc`
- template name: `TivvleJoy Blender Worker - b53fcbf5`
- image digest: `sha256:b53fcbf5fc973ad8e1e5f1e240f58d12885143e11494a3871f579c6fb351faed`
- TEMPLATE_READY: true
- current compatible count: 1
- historical `rc8eyeqhn2` not selected

## Attempt #1 provenance preserved

- Pod `71ttvxy4wbxn46`
- template `rc8eyeqhn2`
- digest `d791981a…`
- result `RENDER_FAILED / TIMEOUT`

## Live plan before create

- GPU: NVIDIA GeForce RTX 4090
- cloud: SECURE
- gpuCount: 1
- stock: verified
- hourly: `$0.740000`
- projected maximum: `$0.246667`

## Smoke job

- job ID: `tjsmo20260819105505`
- frames: 8
- resolution: 1080x1920
- fps: 30
- engine: EEVEE
- manifest key: `jobs/tjsmo20260819105505/manifest.json`
- output key: `renders/finals/meadow-map-mystery/tjsmo20260819105505/final_1080p.mp4`
- jobPackageSha256: `7d8b9c4923b74472f72bab79352e98ee95712f32660c5acfb55339efc09f4cf9`
- workerManifestSha256: `89b7ae0c1dcd7d879c6c7ad614aec39f3fdfef657a7a9f24e365215a35dbb537`
- launchIntentSha256: `acf7de788e131c68df4553f9d2697de4374c9e3eeb342fede48412f2168dc04a`

## Real RunPod

- POST `/v1/pods`: 1
- DELETE `/v1/pods/{id}`: 1
- Pod ID: `iqgio6a31mpf5z`
- actual hourly: `$0.74`
- create: `2026-08-19T10:55:05.895Z`
- worker PROCESS_STARTED: `2026-08-19T11:03:01.057Z`
- render complete: `2026-08-19T11:04:11.902Z`
- launcher finished: `2026-08-19T11:04:17Z`
- actual runtime: ~9 minutes 12 seconds
- estimated actual compute: ~`$0.113` (`0.74 * 552/3600`)

## Worker

- STARTUP_WATCHDOG_MS: `300000`
- REQUIRE_GPU_HEALTH: `true`
- ALLOW_WORKER_SELF_TERMINATE: `false`
- PROCESS_STARTED: yes
- WORKER_READY: yes (launcher history; not fabricated)
- startup watchdog cancelled at WORKER_READY via `startupWatchdog.reached('WORKER_READY')`
- then single-shot owned assets/render/encode/upload
- terminal: COMPLETE
- observed GPU in metadata: `NVIDIA+GeForce+RTX+4090`

History:

PRECHECK → LAUNCH_AUTHORIZED → CREATE_REQUEST_READY → POD_CREATED →
WAITING_FOR_WORKER → WORKER_STARTED → WORKER_READY → RENDER_RUNNING →
RENDER_COMPLETE → CLEANUP_REQUIRED → DELETE_REQUEST_READY → POD_DELETED →
CLEANUP_VERIFIED

## Artifact

- key: `renders/finals/meadow-map-mystery/tjsmo20260819105505/final_1080p.mp4`
- worker SHA-256: `7529ac90461f35b3cac73f7e3a6ef41065e44a6579bf96a52170fb6cd7454c62`
- readback SHA-256: same
- bytes: 375570
- ffprobe: 1080x1920 h264 PASS

## Cleanup

- remaining Pod count: 0
- absence confirmed
- no billable GPU remains

## R2

- written: manifest only
- reused: meadow, map, pip, goat founding assets
- no unrelated deletes

Committed defaults remain blocked:

`PAID_GPU_ENABLED=false`
`POD_CREATION_ENABLED=false`
`REAL_NETWORK_MUTATION_ENABLED=false`
