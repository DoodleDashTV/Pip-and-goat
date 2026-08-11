# Pip Model Import

Character: **Pip** · `CHAR_PIP_001`

## Prerequisites

1. Durable object storage configured (see `docs/STORAGE_SETUP.md`)
2. Primary canonical reference uploaded + **APPROVE & LOCK**

## Import steps (iPhone)

1. Open `/asset-intake#pip`
2. Confirm Primary Reference = READY
3. Tap **ADD PRODUCTION MODEL**
4. Choose the real Pip `.blend` from Files
5. Wait for upload + candidate creation

## What happens

- Binary stored under `character-models/`
- SHA-256 recorded
- Intake version created as **CANDIDATE** (not approved)
- Model status set to `REVIEW` / `productionReady=false`
- Validation checklist queued (meshes, materials, armature, facial, visemes, EEVEE, 1080×1920, …)
- Facial mapping slot ensured
- Character test poses queued (require Blender)
- If reference approved → `ProductionModelReview` PENDING for side-by-side comparison

## Never

- Do not upload the JPEG as a model
- Do not fabricate a `.blend`
- Upload alone never marks Pip production-ready
