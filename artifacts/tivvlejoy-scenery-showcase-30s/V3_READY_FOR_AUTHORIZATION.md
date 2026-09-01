# TIVVLEJOY_REAL_SCENERY_30S_V3_READY_FOR_AUTHORIZATION

## Status
READY_FOR_FRESH_ONE_SHOT_AUTHORIZATION

No V3 paid authorization file exists. No V3 Pod has been created. No V3 GPU billing has occurred.

## Root-cause narrowing after V2
V2 failed before container runtime. `PROCESS_STARTED` never ran, Blender never launched, and zero frames were produced.

A zero-cost anonymous GHCR pull diagnostic proved the exact V2/V3 worker image is publicly pullable:
- workflow run: `33129363630`
- image: `ghcr.io/doodledashtv/ddp-runpod-blender@sha256:7e8bf43653ebd81d1f3fd4452bb2181a1dc11fd97c0ee69789d67b072eebf673`
- anonymous pull: SUCCESS
- pull time: 79 seconds
- local image size: 4,225,837,882 bytes
- RunPod contacted: false
- paid mutation: false

This makes GHCR access/image availability an unlikely explanation for a 30-minute `runtime=null` state. The stronger suspect is the direct GraphQL Pod provisioning path used by the failed scenery launches.

## Proven lifecycle pattern reused
A prior TivvleJoy secure RTX 4090 smoke successfully reached `WORKER_READY`, rendered 1080x1920, passed artifact QC/readback, and cleaned up using a RunPod template plus REST `/v1/pods` lifecycle.

V3 moves the scenery proof onto that same lifecycle pattern instead of `podFindAndDeployOnDemand`.

## Dedicated scenery template
- template ID: `6yz7wkmu34`
- name: `TivvleJoy Scenery Showcase 30s V3`
- exact worker digest pinned: `sha256:7e8bf43653ebd81d1f3fd4452bb2181a1dc11fd97c0ee69789d67b072eebf673`
- runtime secrets stored in template: false
- template verification workflow: `33129543294`
- template evidence artifact: `9669697724`
- Pod POSTs during template verification: 0
- GPU launched during template verification: false
- paid compute: $0

Pinned project evidence: `config/cloud/scenery-showcase-template-v3.json`.

## V3 bridge
Real-assets branch commit: `6c3d270c38bce47f46a7aa3bbbc66606514f1475`

Route:
`/api/scenery/showcase-30s-v3`

Vercel deployment:
`dpl_4jnzwLHA3NJR6DNzvVgueyyJL1Jh`

Deployment state: READY

Bridge contract:
- schema: `TIVVLEJOY_SCENERY_SHOWCASE_30S_BRIDGE_V5`
- execution ID: `scenery-showcase-30s-v3-20260828`
- Pod name: `tivvlejoy-scenery-showcase-30s-v3`
- template ID: `6yz7wkmu34`
- launch transport: `RUNPOD_REST_TEMPLATE`
- worker entrypoint: `scenery-showcase-entry-v2.js`
- runtime dockerArgs required: false
- startup provisioning watchdog: 20 minutes
- render output contract: 1080x1920 / 30 fps / 900 frames / 30 seconds

The bridge exposes a sanitized `pod-status` action so the V3 workflow can distinguish Pod visibility, desired state, container runtime uptime, and R2 worker startup instead of waiting blindly.

## V3 zero-cost preflight
Workflow run: `33129797522`
Artifact: `9669789907`
Conclusion: SUCCESS

Verified:
- ready: true
- template ID: `6yz7wkmu34`
- launch transport: `RUNPOD_REST_TEMPLATE`
- exact worker digest: PASS
- runtime dockerArgs required: false
- active Pod count: 0
- listed private objects: 180
- purchased scenery roles: 12/12
- missing roles: []
- secure RTX 4090 rate: $0.74/hr
- stock: High
- paid mutation performed: false

## Guarded V3 paid workflow
Prepared:
`.github/workflows/tivvlejoy-scenery-showcase-paid-render-v3.yml`

It is dormant and can trigger only from:
`artifacts/tivvlejoy-scenery-showcase-30s/PAID_AUTHORIZATION_V3.json`

That authorization file is intentionally absent.

Safety properties:
- exact V3 authorization contract required
- zero-cost preflight immediately before CREATE
- exactly one launch action in the workflow
- launch POST has NO curl retry
- no automatic second CREATE
- template-backed REST `/v1/pods` launch only
- secure RTX 4090 only
- rate ceiling $0.80/hr
- hard cost contract $2.00
- max render runtime 120 minutes
- Pod must become visible by exact name
- Pod runtime vs `PROCESS_STARTED` are tracked separately
- if runtime starts but R2 startup does not appear for ~5 minutes: fail and cleanup
- if container runtime never appears within 20 minutes: fail and cleanup
- COMPLETE requires 900+ frames, 1080x1920, 30 fps, ~30 sec, artifact/readback SHA match, and `commercialAssetsPublished=false`
- finished MP4 is independently ffprobed and uploaded as a GitHub Actions artifact
- cleanup always runs and must confirm zero exact-name active Pods

Zero-cost paid-workflow contract check:
- workflow run: `33130048271`
- conclusion: SUCCESS
- V3 authorization file present: NO
- paid mutation performed: NO

## Authorization boundary
V1 and V2 authorizations are exhausted and must not be reused.

Do NOT create `PAID_AUTHORIZATION_V3.json` and do NOT launch V3 until a fresh user authorization explicitly permits one new V3 paid CREATE.

PR #169 must remain OPEN / DRAFT / UNMERGED / NOT READY.
