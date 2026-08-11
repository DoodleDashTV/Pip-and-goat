# Production Model Requirements

## Preferred format

`.blend` (also validated `.glb` / `.gltf` / `.fbx` where supported)

## Pip rig controls

global/root, body/pelvis, head, neck, L/R wing, L/R leg, feet, eye aim, blinks, brows, jaw, mouth, facial expressions, backpack (+ straps)

## Goat rig controls

global/root, body/spine, neck, head, four legs, hooves, tail, L/R ear, eyes, blinks, brows, jaw, mouth, facial expressions, collar, GOAT tag

## Facial semantics

jaw_open, mouth_smile/frown/pucker/wide, blink_left/right, eye_look_*, brow_up/down

## Minimum visemes

REST, A, E, I, O, U, MBP, FV, L, WQ

Missing minimum dialogue support → FACIAL RIG / LIP SYNC / FINAL = **BLOCKED**

## Model-to-reference review

Before PRODUCTION_MODEL_APPROVED:

1. Render deterministic Blender views from the **real uploaded model**
2. Side-by-side vs PRIMARY_CANONICAL_REFERENCE
3. Manual checklist (silhouette, proportions, eyes, colors, accessories, 1080p quality)
4. Human approval

Do **not** claim an “exact replica” from a JPEG alone. After approval, that **model version** is the authoritative 3D representation.

## FINAL_1080P gate

Models must hold up at 1080×1920 @ 30 FPS EEVEE — not only DRAFT_FAST.
