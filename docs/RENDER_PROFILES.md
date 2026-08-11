# Render Profiles

| Profile | Resolution | FPS | Engine | Purpose |
|---------|------------|-----|--------|---------|
| DRAFT_FAST | 540×960 | 30 | EEVEE | Timing, animation, camera, lip-sync, continuity review |
| DRAFT_HD | 720×1280 | 30 | EEVEE | High-confidence draft approval |
| FINAL_1080P | 1080×1920 | 30 | EEVEE | Default YouTube Shorts delivery |
| PREMIUM | 1080×1920 (or configurable) | 30 | Cycles | Explicit per-shot fidelity |

Central EEVEE quality presets live in `packages/production/src/cost-optimized-production.ts` (`EEVEE_QUALITY_PRESETS`). Do not scatter samples/shadows/AO settings across scripts.

Per-shot engine override is allowed (e.g. one Cycles shot). Do **not** default an entire episode to Cycles because one shot needs it.

## Caching

Fingerprints include character/animation/environment/prop versions, camera, lighting, render settings, dialogue/lip-sync, timing. Unchanged shots reuse approved renders.
