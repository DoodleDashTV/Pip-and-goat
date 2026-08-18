# TivvleJoy one-Pod paid smoke test

Checkpoint: `TIVVLEJOY_RUNPOD_ONE_POD_PAID_SMOKE_TEST_V1`

This path adds the narrow real-network bridge on top of PR #62 and, only after
every zero-cost gate passes, may execute exactly one paid smoke-test Pod.

Default commands remain blocked. Do not POST /v1/pods unless execute is
explicitly invoked with Justin's paid gate after preflight PASS.

Helper: `scripts/cloud/tivvlejoy-runpod-one-pod-paid-smoke.mjs`  
Preflight: `pnpm cloud:runpod-one-pod-paid-smoke`  
Workflow: `.github/workflows/tivvlejoy-runpod-one-pod-paid-smoke.yml`  
Trigger: `push` to `cursor/tivvlejoy-runpod-one-pod-paid-smoke-73f1` only.

The workflow runs zero-cost validation only. It does not create a Pod.

## Provenance chain

WORKER_IMAGE_READY → TEMPLATE_READY → TEMPLATE_BOUND → POD_PAYLOAD_READY →
LAUNCH_INTENT_READY → LIFECYCLE_READY → REAL_ADAPTER_READY →
PAID_SMOKE_PREFLIGHT_PASS → one real Pod through `runPodLifecycle` + the
PR #62 real adapter.

The old `acceptance-launch.ts` create path is not used.

## Paid gate

Real mutation requires all of:

- `mode=paid-smoke-test`
- `CONFIRM_PAID_GPU=true`
- the required paid approval phrase
- template `rc8eyeqhn2`
- the pinned immutable worker image
- fresh live render-plan PASS
- Secure RTX 4090, GPU count 1
- hourly `<= $0.75`, runtime `<= 20` minutes, projected compute `<= $0.25`
- preexisting Pod count = 0
- a paid-smoke launch receipt bound to the actual staged job identity

Committed defaults stay `PAID_GPU_ENABLED=false`.

## Cleanup

Delete exactly once. Confirm absence with a read-only Pod list. Cleanup
failure returns `RUNPOD_CLEANUP_REQUIRES_ATTENTION`. No automatic paid retry.

Success after artifact readback and confirmed deletion is `PAID_SMOKE_TEST_PASS`.

The pinned worker keeps `StartupWatchdog` armed until single-shot returns.
Paid-smoke worker env therefore sets `STARTUP_WATCHDOG_MS` to the 20-minute
runtime ceiling. The observer also recognizes later worker boot stages
(`RENDER_STARTED`, Blender preflight, asset-ready) as existing
`PROCESS_STARTED` / `WORKER_READY` evidence. That does not authorize a second
paid Pod.

## First authorized paid run

Justin authorized exactly one Secure RTX 4090 Pod. The run created Pod
`71ttvxy4wbxn46` through the PR #59–#62 chain, then the worker default
180s watchdog persisted `TIMEOUT` while single-shot was still downloading
assets / starting Blender. The controller deleted that Pod once and
confirmed absence. Final code: `RENDER_FAILED` / `TIMEOUT`. No retry.
