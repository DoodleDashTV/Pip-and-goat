# TivvleJoy RunPod template binding dry-run

Checkpoint: `TIVVLEJOY_RUNPOD_TEMPLATE_BINDING_DRY_RUN_V1`

This path binds the current TEMPLATE_READY worker template to the guarded Pod-launch payload and proves the future Pod-create request in **dry-run only**.

Current identity is the `b53fcbf5` generation. Historical template `rc8eyeqhn2` remains paid-smoke attempt #1 provenance and cannot be selected for a current launch.

Do not POST /v1/pods.  
Do not launch a GPU.  
Do not execute Blender remotely.  
Do not charge RunPod.

Helper: `scripts/cloud/tivvlejoy-runpod-template-binding.mjs`  
Command: `pnpm cloud:runpod-launch-dry-run`  
Workflow: `.github/workflows/tivvlejoy-runpod-template-binding.yml`  
Trigger: `push` to `cursor/tivvlejoy-runpod-template-binding-73f1` only.

## Approved binding

Non-secret identity only:

- current `templateId=34a9iknfuc` from the `b53fcbf5` trusted receipt
- `templateName=TivvleJoy Blender Worker - b53fcbf5`
- immutable worker image digest `b53fcbf5…`
- sanitized creation-receipt hash from PR #58 / #59
- `TEMPLATE_READY` provenance from PR #59

The binding reuses PR #59 `assessTemplateCompatibilityWithProvenance` and the trusted creation receipt. It does not duplicate or weaken that validator.

## Control-plane template ID

`RUNPOD_RENDER_TEMPLATE_ID` may be supplied as non-secret launch configuration and must equal the current approved template ID.

It must stay out of `payload.env`, worker env, and Blender/FFmpeg child env. It is not `RUNPOD_API_KEY`.

The binding fails closed when:

- the template ID is missing
- the template ID is not the current approved template
- the template ID is the historical attempt #1 id `rc8eyeqhn2`
- the receipt identity or hash differs
- the immutable image differs
- `TEMPLATE_READY` provenance is absent
- more than one approved identity exists

## Dry-run

`pnpm cloud:runpod-launch-dry-run` verifies the pinned image, offline preflight, TEMPLATE_READY provenance, and then builds the complete guarded Pod-create payload with the current top-level `templateId`.

It prints key names only for worker env. It stops before any network mutation.

Success state: `TEMPLATE_BOUND`, `POD_PAYLOAD_READY`, `LAUNCH_INTENT_READY`, `DRY_RUN_PASS`.

Expected markers:

- `TEMPLATE_BINDING: PASS`
- `TEMPLATE_BOUND`
- `templateId=<current approved template>`
- `TEMPLATE_READY`
- `POD_PAYLOAD: PASS`
- `LAUNCH_INTENT: PASS`
- `DRY_RUN_ONLY`
- `POST_PODS=0`
- `GPU_LAUNCHED=false`
- `PAID_COMPUTE=false`

## Tripwire

Any of the following fails immediately with `RUNPOD_MUTATION_TRIPWIRE`:

- POST / DELETE / PATCH `/v1/pods`
- POST / PATCH / DELETE `/v1/templates`
- GraphQL mutation
- network-volume or Serverless endpoint creation

Optional live verification, if used, may only `GET /v1/templates` and `GET /v1/templates/{currentId}`. Historical `rc8eyeqhn2` may be observed unchanged but does not count as current-compatible.

This PR does not authorize a real Pod launch. A later separately gated PR will introduce the one-Pod paid smoke test.
