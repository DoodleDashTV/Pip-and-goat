# TivvleJoy paid smoke attempt #2

Checkpoint: `TIVVLEJOY_RUNPOD_PAID_SMOKE_ATTEMPT_2_V1`

Justin authorized exactly one Secure RTX 4090 Pod on Draft PR #65.
That authorization is consumed by the first `POST /v1/pods` and is not reusable.

Helper: `scripts/cloud/tivvlejoy-runpod-one-pod-paid-smoke.mjs`  
Preflight: `pnpm cloud:runpod-one-pod-paid-smoke`  
Execute: `node scripts/cloud/tivvlejoy-runpod-one-pod-paid-smoke.mjs execute`  
Workflow: `.github/workflows/tivvlejoy-runpod-paid-smoke-attempt-2.yml`  
Trigger: `push` to `cursor/tivvlejoy-runpod-paid-smoke-attempt-2-73f1` only.

The workflow is zero-cost validation only. It does not create a Pod.

## Attempt #1 provenance

Do not modify or erase:

- Pod `71ttvxy4wbxn46`
- historical template `rc8eyeqhn2`
- historical image digest `d791981a…`
- result `RENDER_FAILED / TIMEOUT`
- sanitized receipt `artifacts/tivvlejoy-paid-smoke/attempt-1/paid-smoke-launch-receipt.json`

Attempt #2 writes only under `artifacts/tivvlejoy-paid-smoke/attempt-2/`.

## Current identity

- template `34a9iknfuc`
- template name `TivvleJoy Blender Worker - b53fcbf5`
- immutable image `b53fcbf5…`
- dry-run launch intent `92b252b4c725cdf127bdbc19210c398f6220b6cef14f6080ea06b5e79826367f`

Historical `rc8eyeqhn2` cannot be selected.

## Paid gate

Real mutation requires all of:

- `mode=paid-smoke-test`
- `CONFIRM_PAID_GPU=true`
- phrase `LAUNCH_TIVVLEJOY_GPU`
- current template `34a9iknfuc`
- current immutable worker image
- fresh live render-plan PASS
- Secure RTX 4090, GPU count 1
- hourly `<= $0.75`, runtime `<= 20` minutes, projected compute `<= $0.25`
- preexisting Pod count = 0
- a paid-smoke launch receipt bound to the actual staged job identity

Committed defaults stay `PAID_GPU_ENABLED=false`, `POD_CREATION_ENABLED=false`,
`REAL_NETWORK_MUTATION_ENABLED=false`.

## Startup watchdog

`STARTUP_WATCHDOG_MS=300000`. StartupWatchdog owns only boot through
`WORKER_READY`, then cancels. The single-shot runtime/cost guard owns the
render. Do not reuse the 20-minute startup-watchdog workaround.

## Limits

Exactly one `POST /v1/pods`. No automatic paid retry. Delete once. Confirm
absence. Remaining Pod count must be 0.

## Attempt #2 result

`PAID_SMOKE_TEST_PASS`

- Pod `iqgio6a31mpf5z`
- job `tjsmo20260819105505`
- template `34a9iknfuc` / digest `b53fcbf5`
- WORKER_READY observed, render COMPLETE, artifact QC 1080x1920
- POST `/v1/pods` = 1, DELETE = 1, remaining Pods = 0
- hourly `$0.74`, actual runtime ~9m12s, estimated compute ~`$0.113`
- no paid retry

Sanitized receipt and execute result live under
`artifacts/tivvlejoy-paid-smoke/attempt-2/`. The mp4 is not committed.
