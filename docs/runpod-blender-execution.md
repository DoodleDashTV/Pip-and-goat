# TivvleJoy remote Blender execution foundation

Checkpoint: `TIVVLEJOY_WORKER_SECRET_BOUNDARY_HARDENING_V1`

## CURRENT STATUS

**LEAST-PRIVILEGE WORKER SECRET BOUNDARY**

**REMOTE JOB PACKAGE STAGING FOUNDATION**

**REMOTE EXECUTION FOUNDATION ONLY**

**WORKER CONTRACT ALIGNMENT COMPLETE** — a TivvleJoy job compiled today is structurally executable by the existing RunPod worker later. This revision adds an immutable job-package staging layer. Remote GPU execution is still not enabled.

This branch defines the software contract that will eventually send an approved TivvleJoy scene to a guarded RunPod RTX 4090 worker. It does **not** launch a GPU, create a Pod, or run Blender remotely.

## NOT YET ENABLED

- PAID GPU EXECUTION
- POD CREATION
- REMOTE BLENDER EXECUTION
- AUTOMATIC PRODUCTION RENDERING

A live `render_plan` PASS on RTX 4090 Secure Cloud is evidence that price/availability works. It does **not** authorize paid compute.

## Intended flow

TivvleJoy episode / shot  
→ `tivvlejoy-remote-render-job-v1` (studio / orchestration contract)  
→ deterministic compiler `compileTivvleJoyJobToWorkerManifest()`  
→ `ddp-cloud-job-manifest-v1` (existing RunPod worker execution contract)  
→ immutable job package `buildTivvleJoyRemoteJobPackage()`  
→ stage/verify R2 assets  
→ publish `jobs/<jobId>/manifest.json` last  
→ verify manifest SHA-256  
→ STAGED  
→ FUTURE guarded Pod launch  
→ existing single-shot RunPod worker  
→ R2 asset download + SHA verify  
→ Blender  
→ frame verification  
→ FFmpeg encode  
→ ffprobe validation  
→ R2 upload verification  
→ COMPLETE only after a verified artifact  
→ cleanup  
→ later visual QC

`tivvlejoy-remote-render-job-v1` is **not** a second worker format. It is only the studio/orchestration schema. The only approved bridge to execution is the compiler. The real worker continues to consume `ddp-cloud-job-manifest-v1` via `renderCore.validateManifest()`.

Visual artistic QC is a later stage. Technical checks here do not claim picture quality.

## Existing commands reused

Do not invent a second render pipeline. The accepted production command is already implemented in:

`workers/runpod-blender/src/render-core.js` → `buildBlenderArgv()`

That builder is what the RunPod single-shot worker (`workers/runpod-blender/src/single-shot.js`) already uses. It invokes:

```text
blender --background --factory-startup --python scripts/blender/assemble_scene.py -- \
  --scene-id <shot> \
  --resolution 1080x1920 \
  --fps 30 \
  --engine EEVEE \
  --output-dir <constrained workspace> \
  --assets-json <staged file:// assets> \
  --start-frame <n> \
  --end-frame <n> \
  --samples 24 \
  --camera-preset <preset> \
  --shot-meta-json <json>
```

Then FFmpeg finalization from the same render-core:

```text
ffmpeg -y -framerate 30 -i frame_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 shot.mp4
```

Local zero-cost gates that remain available:

- `pnpm gates:scene` — `scripts/assets/scene_gates.py`
- `pnpm gates:local` — CPU EEVEE acceptance, not FINAL_1080P

## Worker contract alignment

| Layer | Schema | Owner |
| --- | --- | --- |
| Studio / orchestration | `tivvlejoy-remote-render-job-v1` | TivvleJoy foundation |
| Compiler / adapter | `compileTivvleJoyJobToWorkerManifest()` | only approved bridge |
| RunPod execution | `ddp-cloud-job-manifest-v1` | `workers/runpod-blender/src/render-core.js` |

Compiled remote assets are `{ role, r2Key, sha256 }` only. Local `file://` paths may exist in local dry-run preflight, never in the worker manifest.

`outputKey` reuses the existing approved layout from `renderFinalKey`:

`renders/finals/<episode>/<job>/final_1080p.mp4`

TivvleJoy `expected_output_prefix` remains `episode/shot/job` for orchestration identity. Shot identity is also `sceneId`.

Authoritative worker Blender version is read from the worker Dockerfile, FINAL_1080P acceptance pin, and worker manifest default. Those three execution pins must agree. `packages/production` `DEFAULT_BLENDER_VERSION='4.2'` is a requirement prefix, not a silent override.

Cost and runtime reuse the existing worker `limits.maxRuntimeMinutes` / `limits.maxCostUsd` fields (pilot: 20 minutes, $0.25). No second watchdog is added.

## Job package staging

The existing single-shot worker reads:

| Object | Key |
| --- | --- |
| Manifest | `jobs/<jobId>/manifest.json` |
| Status | `jobs/<jobId>/status.json` |
| Startup status | `jobs/<jobId>/startup-status.json` |
| Metadata | `jobs/<jobId>/metadata.json` (written after COMPLETE) |
| Final output | `renders/finals/<episode>/<job>/final_1080p.mp4` |

`buildTivvleJoyRemoteJobPackage()` locks worker-manifest SHA-256, scene SHA-256, every expected-asset SHA-256, outputKey, Blender version, render settings, runtime limit, and cost limit into `jobPackageSha256`. After finalization, any execution-relevant mutation produces a different package hash.

Staging states: `ALREADY_PRESENT_AND_HASH_MATCHES`, `UPLOAD_REQUIRED`, `HASH_MISMATCH`, `MISSING`, `REFUSED`.

Publish order: verify immutable assets → refuse hash mismatch → upload only missing approved assets → verify uploaded checksums → compile worker manifest → hash worker manifest → upload manifest last → read manifest back → verify manifest SHA-256 → mark `STAGED`. A partial upload stays `NOT_READY`. The exact same job ID + worker manifest + asset hashes + output key is idempotent. The same job ID with different execution content fails closed.

Unit tests and dry-run use an in-memory R2 adapter only. Real R2 is not contacted.

## Future worker environment contract

`buildWorkerEnvironment()` is an explicit allowlist. Unknown fields are refused. There is no `process.env` pass-through.

## Trust boundary

GitHub / TivvleJoy launcher  
HAS RunPod API credential  
CAN create/delete Pod  

↓  

RunPod worker  
DOES NOT receive RunPod API credential  
receives only job identity + scoped storage access + render metadata  

↓  

R2 job/assets/output  

The existing worker `worker.js` can call `podTerminate` **only if** `RUNPOD_API_KEY` is present. TivvleJoy does not pass that key and forces `ALLOW_WORKER_SELF_TERMINATE=false`. Pod cleanup stays on the guarded launcher.

The Blender worker cannot create Pods.  
The Blender worker cannot delete Pods.  
The Blender worker cannot query RunPod account resources using launcher credentials.  
The Blender worker only performs the authorized single-shot render job.

### FROM JOB PACKAGE

`RENDER_JOB_ID`  
`RENDER_JOB_MANIFEST_KEY`

### WORKER-ALLOWED STORAGE SECRETS

`R2_ACCESS_KEY_ID`  
`R2_SECRET_ACCESS_KEY`  
or approved `OBJECT_STORAGE_*` equivalents

### LAUNCHER-ONLY SECRETS

`RUNPOD_API_KEY`  
`RUNPOD_RENDER_TEMPLATE_ID`  
`RUNPOD_API_ENDPOINT`  
`GITHUB_TOKEN`  
Vercel tokens  
`LAUNCH_TIVVLEJOY_GPU`

### FROM GUARDED LAUNCH METADATA

`RUNPOD_GPU_HOURLY_RATE`  
`RUNPOD_POD_ID`  
`RENDER_WORKER_ID`

Never embed credentials in the job package or worker manifest. Sanitized logs redact R2 secrets, `rpa_` keys, Bearer tokens, GitHub tokens, and the approval phrase.

Pod launch is not implemented here.

## Pilot pins

These are locked. Do not silently alter them.

| Field | Value |
| --- | --- |
| Profile | `FINAL_1080P` |
| Resolution | 1080x1920 |
| FPS | 30 |
| Engine | EEVEE |
| Samples | 24 |
| GPU | NVIDIA GeForce RTX 4090 |
| Cloud | SECURE |
| GPU count | 1 |
| Runtime | 20 minutes hard deadline |

A future remote command is wrapped as:

`timeout --kill-after=30s 20m blender ...`

The GitHub job timeout of 25 minutes remains only an outer emergency guard so cleanup can run.

## Future paid launch gates

Unchanged from the guarded-render layer:

- `confirm_paid_gpu=true`
- exact phrase `LAUNCH_TIVVLEJOY_GPU`
- immediate `render_plan` PASS
- `RUNPOD_RENDER_TEMPLATE_ID`
- RTX 4090 exact pin, SECURE, 1 GPU, non-interruptible
- hourly ≤ $0.75
- projected compute ≤ $0.25 for the current guarded test mode
- automatic cleanup

## Dry-run

Zero-cost local mode for CI:

```bash
node scripts/cloud/tivvlejoy-remote-blender-foundation.mjs dry-run
```

It creates a sample orchestration job, compiles the real worker manifest, builds an immutable job package, simulates asset verification and manifest upload/read-back on an in-memory adapter, then simulates success/failure/timeout cleanup. It never calls paid RunPod mutation endpoints, never contacts real R2, and never creates a GPU.

## Long-term quality / cost goals

Preserved, not implemented here:

- professional episode quality
- 120 episodes/month target
- up to $500/month available production envelope
- tiered preview/final rendering
- selective shot rerender
- caching/reuse
- cost accounting
- bounded concurrency
