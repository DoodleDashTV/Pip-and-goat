# TIVVLEJOY_BATCH_PRODUCTION_SCHEDULER_V1

Zero-execution scheduler for conceptual work units.

It can plan 1, 10, 30, or 60 episodes and thousands of shots. Nothing runs.

## Work units

VOICE_PREP, ENVIRONMENT_PREP, ASSET_MATERIALIZATION, SHOT_ASSEMBLY,
ANIMATION, VISUAL_REVIEW, RENDER_PREFLIGHT, RENDER, AUDIO_MUX, QC,
DELIVERY.

## Plan (`TIVVLEJOY_BATCH_PLAN_V1`)

- production batches grouped by job type, location, lighting family, and blocked/open
- parallelizable groups
- blocked groups
- critical path
- cache/reuse opportunities
- `batchPlanSha256`

Input order does not change `batchPlanSha256`.

Optimization goals are reuse, shared base locations, shared lighting
families, approved-asset cache reuse, avoiding duplicate work, and keeping
paid render batches blocked until a real authorization receipt exists.
