# TIVVLEJOY_REAL_EPISODE_PRODUCTION_PLAYBOOK_V1

Future real workflow. Human gates stay explicit. This nightshift implements
the software around those gates. It does not pass them.

1. **SCRIPT APPROVED** — human
2. **VOICE RECEIPTS CONFIRMED** — existing confirmed voice identities only.
   Do not change ElevenLabs voice IDs.
3. **SCENERY RESOLVED** — PR #85 inspection and admission. Human visual
   approval required. Software cannot auto-approve. See
   `docs/TIVVLEJOY_REAL_SCENERY_INSPECTION_AND_ADMISSION_V1.md` and
   `docs/TIVVLEJOY_SCENERY_APPROVAL_WORKFLOW_V1.md`.
4. **PIP/GOAT RIGS ADMITTED** — PR #84 contract, admission, test poses,
   human approval. See `docs/TIVVLEJOY_RIG_ARRIVAL_PLAYBOOK_V1.md`.
5. **DIRECTOR PACKAGE** — this nightshift: intent, beats, cameras, staging,
   lighting/VFX, editorial, audio, captions.
6. **CAMERA / STAGING** — semantic plans, 9:16 composition, 180-degree
   continuity.
7. **ANIMATION** — semantic plans bind after rig approval. Director notes
   do not replace the animation planner.
8. **LIGHTING / VFX** — native Blender baseline. No Gaffer or Physical
   Starlight requirement.
9. **SHOT ASSEMBLY** — existing assembly manifests.
10. **BLOCKING PREVIEW** — zero-cost if local tools exist.
11. **DIRECTOR REVIEW** — human. Dailies notes cannot auto-approve.
12. **REVISION** — hashed `SHOT_Vn` bindings. No mutable latest.
13. **VISUAL APPROVAL** — human.
14. **FINAL PREFLIGHT** — software checks only.
15. **PAID RENDER AUTHORIZATION** — human, spend. Software may forecast
    cost. `authorizationIssued` stays false until a human issues it.
16. **FINAL RENDER** — paid, one exact job, receipt required.
17. **EDITORIAL / AUDIO** — timeline + mix plan, then real media QC.
18. **QC** — real media where measurement is required.
19. **DELIVERY PACKAGE**
20. **MANUAL RELEASE** — human.

## What a director may request from scenery

Hero view, interior view, camera corridor, prop closeup. The director
cannot auto-approve assets.

## Rig arrival sequence

Receive approved rig → inspect → test poses → human approval → animation
binding → blocking preview → director review.

## Voice sequence

Approved voice identity → confirmed script line → voice receipt → timing
receipt → dialogue edit → viseme plan → animation → caption → QC.

## Render sequence

Zero-GPU planning → preview → visual approval → cost estimate → explicit
paid authorization → one exact render job → receipt → QC.

This playbook is not authorization to spend, merge, or publish.
