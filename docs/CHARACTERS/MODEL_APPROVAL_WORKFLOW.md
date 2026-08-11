# Model Approval Workflow

```
MODEL UPLOADED
↓
VALIDATION
↓
BLENDER TEST RENDERS
↓
REFERENCE COMPARISON
↓
MANUAL APPROVAL
↓
PRODUCTION MODEL LOCKED
```

Until manual approval:

`MODEL = CANDIDATE / BLOCKED`

## Validation (required where technically possible)

- file readable / Blender can open
- meshes, materials, textures
- armature, bone count, shape keys
- facial controls + eye/blink/jaw/mouth
- visemes: REST A E I O U MBP FV L WQ
- scale, orientation, bounds
- EEVEE compatibility
- 1080×1920 framing
- missing dependencies

## Facial / lip-sync gates

Required semantic controls:

`jaw_open`, `mouth_smile`, `mouth_frown`, `mouth_pucker`, `mouth_wide`, `blink_left`, `blink_right`, `eye_look_left`, `eye_look_right`, `eye_look_up`, `eye_look_down`, `brow_up`, `brow_down`

If minimum facial system missing:

- FACIAL RIG = BLOCKED
- LIP SYNC = BLOCKED
- FINAL PRODUCTION = BLOCKED

## Character test poses

`FRONT_NEUTRAL`, `THREE_QUARTER_NEUTRAL`, `SIDE_NEUTRAL`, `BACK_NEUTRAL`, `SMILE`, `SURPRISED`, `BLINK`, `MOUTH_OPEN`, `WALK_POSE`, `RUN_POSE`, `JUMP_POSE`, `WAVE_POSE` (+ additional studio poses)

Uses the **real uploaded model**. Never fakes renders.

## Reference comparison checklist

Side-by-side: approved PRIMARY_CANONICAL_REFERENCE vs Blender test render

- silhouette, proportions, eye size/color
- comb / horns, beak / nose
- materials, fur/feather appearance
- accessories, overall identity

## STRICT_CHARACTER_LOCK

Every approved production shot involving Pip/Goat must retain:

canonical ID · reference version · DNA version · model version · rig version · material version · voice version · animation versions · accessory state

Missing identity data → **FAIL CLOSED**.
