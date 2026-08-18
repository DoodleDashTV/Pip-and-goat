# TivvleJoy RunPod template binding dry-run

Checkpoint: `TIVVLEJOY_RUNPOD_TEMPLATE_BINDING_DRY_RUN_V1`

This path binds the TEMPLATE_READY template `rc8eyeqhn2` to the guarded Pod-launch payload and proves the future Pod-create request in **dry-run only**.

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

- `templateId=rc8eyeqhn2`
- `templateName=TivvleJoy Blender Worker - d791981a`
- immutable worker image digest from PR #56
- sanitized creation-receipt hash from PR #58 / #59
- `TEMPLATE_READY` provenance from PR #59

The binding reuses PR #59 `assessTemplateCompatibilityWithProvenance` and the trusted creation receipt. It does not duplicate or weaken that validator.

## Control-plane template ID

`RUNPOD_RENDER_TEMPLATE_ID=rc8eyeqhn2` may be supplied as non-secret launch configuration.

It must stay out of `payload.env`, worker env, and Blender/FFmpeg child env. It is not `RUNPOD_API_KEY`.

The binding fails closed when:

- the template ID is missing
- the template ID is not `rc8eyeqhn2`
- the receipt identity or hash differs
- the immutable image differs
- `TEMPLATE_READY` provenance is absent
- more than one approved identity exists

## Dry-run

`pnpm cloud:runpod-launch-dry-run` verifies the pinned image, offline preflight, TEMPLATE_READY provenance, and then builds the complete guarded Pod-create payload with top-level `templateId=rc8eyeqhn2`.

It prints key names only for worker env. It stops before any network mutation.

Success state: `TEMPLATE_BOUND`, `POD_PAYLOAD_READY`, `LAUNCH_INTENT_READY`, `DRY_RUN_PASS`.

Expected markers:

- `TEMPLATE_BINDING: PASS`
- `TEMPLATE_BOUND`
- `templateId=rc8eyeqhn2`
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

Optional live verification, if used, may only `GET /v1/templates` and `GET /v1/templates/rc8eyeqhn2`.

This PR does not authorize a real Pod launch. A later separately gated PR will introduce the one-Pod paid smoke test.
