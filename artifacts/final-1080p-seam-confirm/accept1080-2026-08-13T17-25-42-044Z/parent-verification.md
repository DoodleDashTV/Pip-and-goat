# FINAL_1080P cloud confirmation — chest-seam repair PASS

| | |
| --- | --- |
| Job | `accept1080-2026-08-13T17-25-42-044Z` |
| Pod | `72pluxljut3dtf` (SECURE RTX 4090) |
| Worker image | `sha256:9496498c8dfd…` (source `e831d85`, render code `a4018c0e…`) |
| Artifact | `renders/finals/meadow-map-mystery/accept1080-2026-08-13T17-25-42-044Z/final_1080p.mp4` |
| sha256 | `74cb514a0e62417f8aa4915122afcfebfab86619df6dd1ec548ac27080d707d6` |
| Output | 1080×1920, 90 frames, 30 fps, h264, 3.0s |
| Cost | **$0.1111** of $0.25 cap (9.01 min @ $0.74/hr) |
| Pod after terminate | absent; `myself.pods` empty; no billable GPU |

## QC (postrun, off-GPU)

- R2 readback sha256 matches metadata and status.json
- blackdetect=0, freezedetect=0
- resolutionExact1080x1920, frameCountMatch

## Provenance on the pod

Worker reported `renderCodeMatch: true`, `assembleScriptSha256` matching the
shadow-caster repair (`6ba991ba…`), image digest `sha256:9496498c…`.

## Prior attempts on this branch (before success)

| Pod | Result | Cost | Cause |
| --- | --- | --- | --- |
| `j80g7m89y4fema` | STARTUP_STALL | $0.101 | orchestrator stall-kill during cold pull |
| `hfbwg1adbcv38x` | NO_STARTUP_STATUS_TIMEOUT | $0.187 | 15 min pull/boot, no R2 yet |
| `1qfrwq50v4c216` | FAILED (false) | $0.084 | BOOTING heartbeat looked like FAILED |
| `72pluxljut3dtf` | **COMPLETE** | $0.111 | — |

Local chest-seam repair evidence remains under `artifacts/local-acceptance-1080p/seam-repair/`.
