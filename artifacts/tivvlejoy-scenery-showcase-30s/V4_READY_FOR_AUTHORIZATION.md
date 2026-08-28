# TIVVLEJOY_REAL_SCENERY_30S_V4_READY_FOR_AUTHORIZATION

## Status
READY_FOR_FRESH_ONE_SHOT_AUTHORIZATION

No V4 paid authorization file exists. No V4 Pod has been created. No V4 GPU billing has occurred.

## V3 breakthrough
V3 proved the template-backed REST lifecycle solves the old startup failure: the container/Node worker started and reached `PRIVATE_SCENERY_DISCOVERY`. V3 then failed only because `nature_library` was an unnecessary heavy role for this dry proof. Cleanup confirmed zero active exact-name Pods.

## V4 simplification
The first visible proof is now deliberately reduced to 10 actual purchased scenery roles:
- mountain_geometry
- background_mountains
- forest_geometry
- forest_textures
- village_geometry
- village_textures
- tavern_geometry
- sky_hdri
- sky_machine
- world_shaders

`nature_library` and `water_system` are not required for this dry showcase. This avoids unnecessary nature duplication (~693 MB compatibility payload) and unused water materialization while preserving real purchased scenery only.

## Immutable V4 worker
Image:
`ghcr.io/doodledashtv/ddp-runpod-blender@sha256:1bef7ad588e74f6a59ef1a8e0ebcebc67cb94e75868d930a57fa8f07d30f44a6`

- Blender: 4.2.2
- thin child of the V3 worker that already reached runtime on RunPod
- worker entrypoint: `scenery-showcase-entry-v2.js`
- required role count: 10
- nature library required: false
- water system required: false
- resolution contract: 1080x1920
- fps: 30
- frame count: 900
- commercial asset bytes baked into image: false
- RunPod contacted by image build: false
- paid GPU launches during image build: 0

Image build workflow: `33130841799`
Image evidence artifact: `9670225605`

## Exact live V4 asset selection
Route:
`/api/scenery/showcase-selection-v4`

Live result:
- ready: true
- required roles: 10
- selected roles: 10
- distinct purchased scenery only: true
- selected total bytes: 4,551,427,293
- hard input cap: 5,368,709,120 bytes (5 GiB)
- nature library required: false
- water system required: false
- paid mutation: false

Selected bytes remain below the hard 5 GiB input cap.

## Dedicated V4 RunPod template
- template ID: `nasqriytzc`
- name: `TivvleJoy Scenery Showcase 30s V4`
- exact V4 worker digest pinned
- runtime secrets stored in template: false
- template workflow run: `33131086185`
- template evidence artifact: `9670267464`
- Pod POST count during template verification: 0
- GPU launched: false
- paid compute: $0

Pinned project evidence:
`config/cloud/scenery-showcase-template-v4.json`

## V4 bridge
Route:
`/api/scenery/showcase-30s-v4`

Vercel deployment:
`dpl_25uB82xL3PBMQeQAKASHTRQuXnHy`

State: READY

Contract:
- bridge schema: `TIVVLEJOY_SCENERY_SHOWCASE_30S_BRIDGE_V6`
- preflight schema: `TIVVLEJOY_SCENERY_SHOWCASE_30S_PREFLIGHT_V6`
- launch schema: `TIVVLEJOY_SCENERY_SHOWCASE_30S_LAUNCH_V6`
- execution ID: `scenery-showcase-30s-v4-20260828`
- Pod name: `tivvlejoy-scenery-showcase-30s-v4`
- template: `nasqriytzc`
- transport: `RUNPOD_REST_TEMPLATE`
- no runtime dockerArgs
- startup provisioning watchdog: 20 minutes
- output: 1080x1920 / 30 fps / 900 frames / 30 seconds

## Zero-cost V4 bridge preflight
Workflow run: `33131217202` (rerun after Vercel route became live)
Artifact: `9670344223`
Conclusion: SUCCESS

Verified:
- exact worker image: PASS
- exact template: PASS
- 10/10 distinct purchased roles
- selected total bytes: 4,551,427,293 <= 5 GiB cap
- secure RTX 4090: $0.74/hr
- stock: High
- active RunPod pods: 0
- max Creates: 1
- hard cost contract: $2.00
- max hourly rate: $0.80/hr
- paid mutation performed: false

## Dormant guarded V4 paid workflow
Prepared:
`.github/workflows/tivvlejoy-scenery-showcase-paid-render-v4.yml`

It can trigger only from:
`artifacts/tivvlejoy-scenery-showcase-30s/PAID_AUTHORIZATION_V4.json`

That authorization file is intentionally absent.

Safety contract:
- exact V4 authorization schema required
- 10-role dry-proof contract required
- zero-cost preflight immediately before CREATE
- exactly one launch action
- paid CREATE POST has NO retry
- no automatic second CREATE
- template-backed REST launch only
- SECURE RTX 4090 only
- max rate $0.80/hr
- hard cost $2.00
- max runtime 120 minutes
- separate Pod/runtime/startup/render observations
- COMPLETE requires 900+ frames, 1080x1920, 30 fps, ~30 sec, 10 selected roles, artifact/readback SHA match, and commercialAssetsPublished=false
- final MP4 independently ffprobed and uploaded as a GitHub Actions artifact
- cleanup always runs and must confirm zero exact-name active Pods

Zero-cost V4 paid-workflow contract check:
- workflow run: `33131282484`
- conclusion: SUCCESS
- V4 authorization file present: NO
- paid mutation performed: NO

## Authorization boundary
V1, V2, and V3 authorizations are exhausted and must not be reused.

Do NOT create `PAID_AUTHORIZATION_V4.json` and do NOT launch V4 until the user explicitly gives a fresh authorization for one V4 paid CREATE.

PR #169 must remain OPEN / DRAFT / UNMERGED / NOT READY.
