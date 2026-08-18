# TivvleJoy remote Blender execution foundation

Checkpoint: `TIVVLEJOY_RUNPOD_BLENDER_EXECUTION_FOUNDATION_V1`

## CURRENT STATUS

**REMOTE EXECUTION FOUNDATION ONLY**

This branch defines the software contract that will eventually send an approved TivvleJoy scene to a guarded RunPod RTX 4090 worker. It does **not** launch a GPU and does **not** run Blender remotely.

## NOT YET ENABLED

- PAID GPU EXECUTION
- REMOTE BLENDER EXECUTION
- AUTOMATIC PRODUCTION RENDERING

A live `render_plan` PASS on RTX 4090 Secure Cloud is evidence that price/availability works. It does **not** authorize paid compute.

## Intended flow

TivvleJoy approved scene  
→ render manifest  
→ preflight  
→ guarded RunPod approval  
→ Pod  
→ asset staging  
→ Blender  
→ technical output verification  
→ cleanup  
→ later visual QC

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

It creates a sample manifest, validates it, builds the deterministic argv, simulates success/failure/timeout, and requires cleanup. It never calls paid RunPod mutation endpoints and never creates a GPU.

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
