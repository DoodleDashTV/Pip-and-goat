# Runpod Blender GPU Worker (DDP)

Reusable production worker for Cloudflare R2 + Runpod + Blender EEVEE.

## Includes

- Blender 4.2.x
- FFmpeg / FFprobe
- Node.js worker
- R2 (S3-compatible) client
- Persistent Blender daemon philosophy (start once, load Pip/Goat once)
- GPU health check + tiny EEVEE benchmark
- Idle shutdown + runaway protection
- Structured progress stages for DDP UI

## Safety

- `CLOUD_RENDER_ENABLED=false` by default
- `ALLOW_PAID_GPU_LAUNCH=false` by default
- Do **not** deploy or start paid GPUs until the pre-deployment gate passes **and** a human explicitly approves

## Build

```bash
docker build -t ddp-runpod-blender:v1 workers/runpod-blender
```

## Required env (server-side only — never commit)

- `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `RENDER_API_URL` — DDP claim/complete API
- `RUNPOD_POD_ID` — set by runtime when on Runpod
- `IDLE_SHUTDOWN_MINUTES` (default 5)
- `MAX_JOB_RUNTIME_MINUTES` (default 180)

## Lifecycle

startup → health check → job fetch → asset download → Blender start →
persistent scene load → render → FFmpeg → FFprobe → upload → callback → idle shutdown
