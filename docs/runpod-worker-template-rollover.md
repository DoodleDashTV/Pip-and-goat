# TivvleJoy RunPod worker template rollover

Checkpoint: `TIVVLEJOY_RUNPOD_WORKER_TEMPLATE_ROLLOVER_V2`

This path rolls the current required template from paid-smoke attempt #1
(`rc8eyeqhn2` / `d791981a`) to the watchdog-fixed immutable worker image
`b53fcbf5`.

It may create **exactly one** new private NVIDIA Pod template.
It must not create a Pod, launch a GPU, or spend paid compute.
It must not PATCH or DELETE `rc8eyeqhn2`.

Helper: `scripts/cloud/tivvlejoy-runpod-template-create.mjs`  
Receipts: `scripts/cloud/tivvlejoy-runpod-template-creation-receipt.mjs`  
Binding: `scripts/cloud/tivvlejoy-runpod-template-binding.mjs`  
Command: `pnpm validate:runpod-template-rollover`  
Workflow: `.github/workflows/tivvlejoy-runpod-worker-template-rollover.yml`  
Trigger: `push` to `cursor/tivvlejoy-runpod-worker-template-rollover-73f1` only.

## Generations

Historical paid-smoke attempt #1 remains immutable evidence:

- `PAID_SMOKE_ATTEMPT_1_TEMPLATE_ID=rc8eyeqhn2`
- `PAID_SMOKE_ATTEMPT_1_WORKER_IMAGE` digest `d791981a…`
- historical create phrase `CREATE_TIVVLEJOY_TEMPLATE_D791981A` (documented only)

Current generation:

- template ID `34a9iknfuc`
- image digest `b53fcbf5…`
- source commit `1ea2cf58c9cfc015929d0a4ca63446898d59ba79`
- render-code SHA `52dc742a3aee4cd7c1f141dcdfd45b9c81d6c073b205c3f8eda915adb9505ab5`
- template name `TivvleJoy Blender Worker - b53fcbf5`
- create phrase `CREATE_TIVVLEJOY_TEMPLATE_B53FCBF5`
- create HTTP status `201`

A receipt may normalize omitted GET fields only for the same template ID,
name, and immutable image. The old receipt cannot prove the new template.
The new receipt cannot prove the old template.

## Create gate

Creation remains `mode=create-template` plus the exact current phrase.
Exactly one `POST /v1/templates` is allowed, and only when current-generation
compatible count is zero and no conflicting intended identity exists.

Historical `rc8eyeqhn2` is not a current-generation duplicate.

## After TEMPLATE_READY

Current `APPROVED_TEMPLATE_ID` / `APPROVED_TEMPLATE_NAME` /
`APPROVED_TEMPLATE_BINDING` resolve only to the new generation.
A new `launchIntentSha256` is generated. Paid smoke stays preflight-only.
`PAID_GPU_ENABLED=false`, `POD_CREATION_ENABLED=false`,
`REAL_NETWORK_MUTATION_ENABLED=false`.
