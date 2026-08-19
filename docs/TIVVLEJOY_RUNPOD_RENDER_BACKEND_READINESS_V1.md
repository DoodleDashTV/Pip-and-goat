# TivvleJoy RunPod render backend readiness

Checkpoint: `TIVVLEJOY_RUNPOD_RENDER_BACKEND_READINESS_V1`

This is a zero-GPU production admission controller. It proves that a structured
render request may later be authorized for paid execution. It does not launch a
Pod, contact a GPU for work, or issue paid authorization.

## Proven backend

Paid-smoke attempt #2 passed (`PAID_SMOKE_TEST_PASS`) on:

- template ID `34a9iknfuc`
- template name `TivvleJoy Blender Worker - b53fcbf5`
- immutable digest `sha256:b53fcbf5fc973ad8e1e5f1e240f58d12885143e11494a3871f579c6fb351faed`

That template must not be mutated by this path. Historical attempt #1 template
`rc8eyeqhn2` remains provenance only and cannot satisfy current readiness.
Mutable tags such as `latest`, `stable`, and `production` are refused.

The versioned identity record is `TIVVLEJOY_RENDER_BACKEND_IDENTITY_V1`.

## Zero-GPU admission

Default mode is `OFFLINE_READINESS`: hashing, receipts, approvals, cached
telemetry estimates, and sanitized payload construction. Provider contacted is
false.

Optional `LIVE_READONLY_PREFLIGHT` may GET the current template, template list,
stock/price observation, and Pod list. POST, PUT, PATCH, and DELETE are
forbidden. Live mode may emit `LIVE_PRICE_VERIFIED`. It must never emit
`LAUNCH_AUTHORIZED`.

Any forbidden mutation is `ZERO_GPU_MUTATION_TRIPWIRE`.

## State machine

Active Preview states:

`DRAFT` → `VALIDATING_HASHES` → `VALIDATING_ASSETS` → `VALIDATING_SHOT` →
`ESTIMATING_COST` → `ZERO_GPU_READY` → `BACKEND_READY_PAID_AUTH_REQUIRED`

Blocked states include hash, asset, shot, stale visual approval, backend,
cost, runtime, low-confidence estimate, paid-authorization, and secret-safety
failures.

`RUNNING`, `GPU_STARTING`, and `RENDERING` are not Preview states.

FINAL success is `BACKEND_READY_PAID_AUTH_REQUIRED`.

## Hash model

Every structured request generates:

- `jobPackageSha256`
- `workerManifestSha256`
- `shotDependencySha256`
- `launchIntentSha256`

`jobPackageSha256` includes production, episode, shot, frames, fps, resolution,
engine, profile, Blender version, template ID, worker digest, asset receipt
list, shot dependency hash, and output destination identity. It excludes
timestamps, UI notes, display labels, and unrelated episode metadata.

`workerManifestSha256` hashes the exact manifest bytes.

`shotDependencySha256` changes when camera, frames, character/rig versions,
animation, visible geometry, environment, props, materials, style, lighting,
world/HDRI, render settings, resolution, fps, or Blender version change. It
does not change for title edits, notes, timestamps, or unrelated shots.

## Approval model

Assets require exact versions and hashes. Missing, mismatched, quarantined, or
unapproved assets block. Hero assets must be hero-safe. There is no "latest"
fallback.

Shot visual approval uses the `TIVVLEJOY_SHOT_VISUAL_APPROVAL_V1` adapter
receipt. Accepted results are `VISUALLY_APPROVED` and `VISUALLY_EXCELLENT`
with score >= 90 and zero hard blockers. The receipt
`shotDependencySha256` must equal the current dependency hash or the request
is `BLOCKED_VISUAL_APPROVAL_STALE`.

## Cost model

Guarded envelope is unchanged: Secure RTX 4090 × 1, hourly <= $0.75, runtime
<= 20 minutes, projected/worst-case compute <= $0.25.

The estimator is calibrated from paid-smoke attempt #2 telemetry only. It does
not fabricate additional runs. Exact FINAL matches can reach HIGH confidence.
Insufficient evidence is LOW. FINAL paid-ready with LOW confidence is
`BLOCKED_ESTIMATE_LOW_CONFIDENCE`.

## Cache model

`CACHE_REUSE_ELIGIBLE` requires an exact `shotDependencySha256` match.
This PR does not automatically reuse a Production final.

## Readiness receipt

`TIVVLEJOY_RENDER_BACKEND_READINESS_V1` is the machine-readable receipt. It
always records `gpuLaunched=false`, `paidCompute=false`,
`providerMutationCount=0`, and `paidAuthorization=REQUIRED`. Secrets are
excluded.

## Paid authorization boundary

`TIVVLEJOY_PAID_RENDER_AUTHORIZATION_V1` is defined and not activated.
`maxPodCreates=1`. Suggested expiry is 15 minutes. Authorization would be
consumed by the first actual Pod create. Preview cannot fabricate or issue it.

The future paid executor remains a later milestone.

## Failure states

The Preview queue returns either `BACKEND_READY_PAID_AUTH_REQUIRED` or an
exact `BLOCKED_*` status. Missing records are shown as blocked, not invented.
