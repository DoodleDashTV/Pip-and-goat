# TivvleJoy RunPod single-Pod lifecycle

Checkpoint: `TIVVLEJOY_RUNPOD_POD_LIFECYCLE_DRY_RUN_V1`

This path proves the future single-Pod launcher lifecycle in **simulation only**.

Do not POST /v1/pods.  
Do not DELETE a real Pod.  
Do not launch a GPU.  
Do not execute Blender remotely.  
Do not mutate Production R2.

Helper: `scripts/cloud/tivvlejoy-runpod-lifecycle.mjs`  
Command: `pnpm cloud:runpod-lifecycle-dry-run`  
Workflow: `.github/workflows/tivvlejoy-runpod-pod-lifecycle.yml`  
Trigger: `push` to `cursor/tivvlejoy-runpod-pod-lifecycle-73f1` only.

## Approved identity

- template ID `rc8eyeqhn2`
- immutable worker image from PR #56
- launch intent `71b73dd63e9432c68f2ea24a9232936f628cfd5cf5f1492ec6da1cddff1d29fc`
- `ALLOW_WORKER_SELF_TERMINATE=false`

## States

`PRECHECK` → `LAUNCH_AUTHORIZED` → `CREATE_REQUEST_READY` → `POD_CREATED` → `WAITING_FOR_WORKER` → `WORKER_STARTED` → `WORKER_READY` → `RENDER_RUNNING` → `RENDER_COMPLETE` | `RENDER_FAILED` | `TIMED_OUT` → `CLEANUP_REQUIRED` → `DELETE_REQUEST_READY` → `POD_DELETED` → `CLEANUP_VERIFIED`

Success ends in `LIFECYCLE_PASS`.

## Observation contract

The controller reads the existing worker single-shot objects only:

- `jobs/{jobId}/startup-status.json` (`PROCESS_STARTED`, `WORKER_READY`)
- `jobs/{jobId}/status.json` (progress, `COMPLETE`, `FAILED`)

`COMPLETE` requires `artifactKey` and a 64-hex `artifactSha256`. There is no public ingress and no `RENDER_API_URL`.

## Cleanup

Every path that creates a simulated Pod deletes it exactly once. Create failure or a malformed create response does not fabricate a Pod ID and does not delete. A failed delete returns `RUNPOD_CLEANUP_REQUIRES_ATTENTION`.

## Cost guards

Unchanged: RTX 4090, SECURE, 1 GPU, `$0.75/hr`, 20 minutes, `$0.25` compute. A missing, stale, or over-cap render-plan receipt refuses before create.

## Tripwire

Real POST/DELETE/PATCH of Pods or templates, and GraphQL mutations, fail immediately with `RUNPOD_MUTATION_TRIPWIRE`.
