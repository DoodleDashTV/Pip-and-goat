# TIVVLEJOY_REAL_SCENERY_30S_FAILURE_REPORT_V1

Checkpoint after the one allowed retry. No further CREATE.

## Exact failing stage

`STARTUP_WATCHDOG` on retry run `33124833097`.

The worker never became ready. RunPod listed the exact-name pod as `RUNNING` with `runtime.uptimeInSeconds=null` for the entire 15-minute watchdog. `startup-status.json` was never written. No Blender process ran.

## Creates and pods

| Run | Result |
| --- | --- |
| 33120412398 (first CREATE) | Poll died at 5.5 min on `curl 35`. Cleanup killed the still-starting pod. |
| 33124833097 (one retry) | CREATE succeeded. Poll survived. Watchdog fired at poll i=60 / 23:18:10Z. |

- Exact name: `tivvlejoy-scenery-showcase-30s-v1`
- Retry pod id: `zy7whd3zpch2rq`
- SECURE RTX 4090 at $0.74/hr
- Creates used: 2 (original + one retry)
- Another retry allowed: **no**

## Render / startup evidence

- `startup-status.json` written: **no**
- `status.json` written: **no**
- Render frames produced: **0**
- MP4 present: **no**
- Purchased roles still 12/12
- Fake scenery was not substituted

## Inspected failure points

1. Entrypoint intended: `scenery-showcase.js` (CREATE payload confirmed).
2. dockerArgs water-prefix patch was requested by the Vercel bridge. The container never reported uptime, so the patch never ran.
3. First R2 write is inside `scenery-showcase.js` after env/R2 client setup. That code never executed.
4. R2 credentials on the bridge GET still work (12/12 roles listed).
5. Bridge GET stayed healthy for 15 minutes on the retry (`state=NONE startup=NO` every poll). The first-run curl reset is fixed.
6. 15-minute watchdog is shorter than a cold pull of the pinned Blender worker image on a new 4090 node.

## Cleanup

Retry cleanup: `matchedBefore=1`, `terminatedCount=1`, `remainingActiveExactName=0`, `billingCleanupConfirmed=true`.
Recheck: 0 pods total, exact-name 0, cleanup route `billingCleanupConfirmed=true`.

## Exact minimal patch required next

Do not CREATE again under this authorization.

Next authorized run must:

1. Lengthen the startup watchdog past a cold GHCR pull of `sha256:3eb753e642a3d257c9291fa651124bceb707bd2ac4e1aa40c3cf1eedabda3f3a` (25–30 minutes).
2. Write an early `PROCESS_STARTED` marker from `scenery-showcase.js` before role discovery, matching `worker.js`.
3. Prefer baking the dry-showcase water-prefix change into `showcase_30s.py` so `dockerArgs` is not required for startup.

Phase 2 polished cut was not started.
