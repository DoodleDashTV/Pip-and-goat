# Cloud Production Engine (R2 + Runpod + GPU Blender)

Extends existing DDP — does **not** replace local Blender, Pip/Goat assets, or cache systems.

## Architecture

```
iPhone / DDP UI
 → episode approval
 → DDP render queue
 → LocalBlenderProvider | RunpodBlenderProvider
 → Runpod GPU worker
 → pull assets from Cloudflare R2
 → persistent Blender worker
 → FINAL_1080P
 → FFmpeg / FFprobe QC
 → upload MP4/logs to R2
 → update DDP status
 → terminate idle GPU
```

## Safety defaults

| Setting | Default |
|---------|---------|
| `CLOUD_RENDER_ENABLED` | `false` |
| `ALLOW_PAID_GPU_LAUNCH` | `false` |
| `MAX_GPU_HOURLY_PRICE` | `0.80` |
| `MAX_SINGLE_JOB_COST` | `2.00` |
| `MAX_DAILY_GPU_COST` | `10.00` |
| `MAX_MONTHLY_GPU_COST` | `50.00` |
| `IDLE_SHUTDOWN_MINUTES` | `5` |
| `MAX_JOB_RUNTIME_MINUTES` | `180` |

Paid GPUs must not start until the pre-deployment report is ready **and** a human explicitly approves.

## Secrets (never commit / never log)

- `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `RUNPOD_API_KEY` (server-side only)

Aliases also accepted: `OBJECT_STORAGE_*`.

## Commands

```bash
pnpm cloud:runpod-auth    # non-billable
pnpm cloud:r2-test        # requires R2 secrets
pnpm cloud:preflight      # Phase 21 gate
```

## Engine 3.0 — first paid GPU benchmark

After the cloud pre-deployment gate PASS and **explicit human approval**:

```bash
# Process-local flags only (do not commit). Hard ceiling $0.50.
CLOUD_RENDER_ENABLED=true \
ALLOW_PAID_GPU_LAUNCH=true \
MAX_GPU_HOURLY_PRICE=0.40 \
MAX_SINGLE_JOB_COST=0.50 \
MAX_DAILY_GPU_COST=0.50 \
MAX_MONTHLY_GPU_COST=0.50 \
IDLE_SHUTDOWN_MINUTES=2 \
MAX_JOB_RUNTIME_MINUTES=20 \
pnpm cloud:first-gpu-bench -- --confirm-paid-launch
```

What it does:
1. Uploads Pip/Goat/meadow/map + bench scripts to R2
2. Launches one RTX 4090 pod on a public CUDA image (bootstrap installs Blender)
3. Renders FINAL_1080P 30 frames (1080×1920), uploads MP4 + JSON report to R2
4. Self-terminates / orchestrator terminates; refuses duplicate live bench pods
5. Compares against CPU baseline `final_rep_1s` ≈ 127436 ms

Scripts: `scripts/cloud/first-paid-gpu-benchmark.ts`, `scripts/cloud/runpod-bench-bootstrap.sh`, `scripts/blender/first_gpu_benchmark.py`.

## Key packages

- `packages/production/src/cloud/*` — providers, manifest, sync, cost, shutdown, runaway, season queue
- `workers/runpod-blender/` — GPU worker image template
- `workers/blender-renderer/` — existing local worker (preserved)
- APIs: `/api/cloud/preflight`, `/api/cloud/status`, `/api/cloud/jobs`

## Routing policy

- `AUDIT_FAST` → LOCAL
- `DRAFT_FAST` → LOCAL (cloud optional)
- `FINAL_1080P` → CLOUD preferred when enabled + healthy
- Cloud unavailable → fail closed (no silent alternate spend) unless policy says otherwise
