# TivvleJoy RunPod real lifecycle adapter

Checkpoint: `TIVVLEJOY_RUNPOD_REAL_LIFECYCLE_ADAPTER_V1`

This path wires the PR #61 single-Pod lifecycle controller to the existing
guarded create/delete/recovery primitives. It does **not** launch a Pod.

Do not POST /v1/pods.  
Do not DELETE a real Pod.  
Do not launch a GPU.  
Do not execute Blender remotely.  
Do not mutate Production R2.

Helper: `scripts/cloud/tivvlejoy-runpod-real-lifecycle-adapter.mjs`  
Command: `pnpm cloud:runpod-real-lifecycle-preflight`  
Workflow: `.github/workflows/tivvlejoy-runpod-real-lifecycle-adapter.yml`  
Trigger: `push` to `cursor/tivvlejoy-runpod-real-lifecycle-adapter-73f1` only.

## Adapter modes

- `SIMULATED` — in-memory adapter from PR #61
- `REAL_BUT_BLOCKED` — real adapter default. Create/delete refuse with `PAID_EXECUTION_NOT_AUTHORIZED` before any mutation.
- `REAL_AUTHORIZED` — future paid smoke-test only. Prepared here, not used. Requires every paid gate condition plus a non-network fetch in this PR.

The lifecycle controller stays one source of truth. Only the injected adapter changes.

## Paid gate (prepared, not used)

Future real execution must require all of:

- `mode=paid-smoke-test`
- `CONFIRM_PAID_GPU=true`
- the required paid approval phrase
- approved template `rc8eyeqhn2`
- the pinned immutable worker image
- fresh render-plan PASS
- Secure RTX 4090, GPU count 1
- hourly cost `<= $0.75`
- runtime `<= 20` minutes
- projected compute `<= $0.25`
- approved `launchIntentSha256`
- `TEMPLATE_READY`, `TEMPLATE_BOUND`, `POD_PAYLOAD_READY`, `LIFECYCLE_READY`

Hard defaults remain `PAID_GPU_ENABLED=false`, `POD_CREATION_ENABLED=false`, `REMOTE_BLENDER_EXECUTION_ENABLED=false`.

## Cleanup

If a Pod ID is ever obtained: delete once. Ambiguous create reuses exact-name recovery. One match is deleted. Zero matches are confirmed. Multiple matches return `RUNPOD_CLEANUP_REQUIRES_ATTENTION`. No fabricated IDs.

## Observation

The same single-shot objects remain authoritative:

- `jobs/{jobId}/startup-status.json`
- `jobs/{jobId}/status.json`

This PR uses in-memory R2 only. The read-only observer interface is prepared and must not write or delete.

## Next action

Stop after `REAL_LIFECYCLE_PREFLIGHT_PASS`. The one-Pod paid smoke test requires a separate explicit approval.
