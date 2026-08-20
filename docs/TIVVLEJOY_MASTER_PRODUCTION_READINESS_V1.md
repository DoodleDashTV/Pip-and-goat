# TIVVLEJOY_MASTER_PRODUCTION_READINESS_V1

Aggregates: SCRIPT, VOICE, DIRECTING, SCENERY, RIGS, ANIMATION, CAMERA,
STAGING, LIGHTING, VFX, EDITORIAL, AUDIO, CAPTIONS, SHOT_APPROVAL,
ASSEMBLY, RENDER_PREFLIGHT, RENDER, QC, DELIVERY.

## States

`FOUNDATION_ONLY`, `PLANNING_OPERATIONAL`, `DIRECTING_OPERATIONAL`,
`ASSET_PIPELINE_OPERATIONAL`, `ANIMATION_PIPELINE_OPERATIONAL`,
`EDITORIAL_PIPELINE_OPERATIONAL`, `CONTROLLED_PRODUCTION_VALIDATION_READY`,
`WAITING_FOR_EXTERNAL_ASSETS`, `WAITING_FOR_RIGS`,
`WAITING_FOR_HUMAN_APPROVAL`, `WAITING_FOR_PAID_RENDER_AUTHORIZATION`,
`PRODUCTION_READY`.

`PRODUCTION_READY` is unreachable from synthetic fixtures. Even when every
boolean real-flag is hypothetically true, software returns
`CONTROLLED_PRODUCTION_VALIDATION_READY` and never `PRODUCTION_READY`.

## Human-readable blockers

| Code | Operator label |
| --- | --- |
| `MISSING_CHARACTER_RIG` | Waiting for approved Pip or Goat production rig. |
| `MISSING_SCENERY_APPROVAL` | Review the mountain hero candidate. |
| `MISSING_VOICE_RECEIPT` | Confirm the episode dialogue receipt. |
| `MISSING_SHOT_REVIEW` | Review Shot 08 camera and performance. |
| `MISSING_PAID_RENDER_AUTHORIZATION` | Paid final render authorization required. |

Never say "GPU started", "render completed", or "asset approved" without
real evidence.

Critical path ranks a missing rig above caption polish.
