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
pnpm exec tsx scripts/cloud/runpod-auth-test.ts   # non-billable
pnpm exec tsx scripts/cloud/r2-connection-test.ts # requires R2 secrets
pnpm exec tsx scripts/cloud/preflight-report.ts   # Phase 21 gate
```

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
