# TIVVLEJOY_HDRI_MEMORY_QUALIFICATION_AND_LARGER_MEMORY_HANDOFF_V4_RESULT

starting branch: cursor/tivvlejoy-scenery-showcase-30s-v1-73f1
starting SHA: 2a164440c1efc5c4f7329c6e4d0b337be092b49c
final branch: cursor/tivvlejoy-scenery-showcase-30s-v1-73f1
PR: #169 OPEN DRAFT UNMERGED NOT READY

Owned 15k Image0001.jpg SHA-256 2c747a306f1f8a3031155d3a266cc56b62e91966431db54e67c36f772c58c20c was not overwritten.

## Isolated Cycles (64x64 / 1 sample / denoise off)

- H15 15000x7500: peak 5699858432 B (5.31 GiB), after 306073600 B, 8.55 s, PNG yes
- H8 8192x4096: peak 1912504320 B (1.78 GiB), after 302850048 B, 2.00 s, PNG yes, reduction 3.53 GiB vs H15
- H4 4096x2048: peak 700370944 B (0.65 GiB), after 298754048 B, 0.59 s, PNG yes, reduction 4.66 GiB vs H15

## Visual comparison (540x960 / 16 samples, identical water/rock/beech/terrain/sun)

- H15 peak 5.93 GiB, 29.8 s
- H8 peak 2.43 GiB, 24.5 s
- H4 peak 1.32 GiB, 21.6 s
- H15 vs H8: RMSE 15.72 (noise-inflated), sky MAE 0.21, water MAE 2.45, mean RGB shift ~2
- H15 vs H4: RMSE 18.21, sky MAE 0.26, water MAE 3.41

H8: CINEMATIC_LIGHTING_HDRI_APPROVED for Cycles lighting/reflections. Not a visual downgrade at this camera. Original remains authoritative.

H4: not adopted. Slightly larger water/sky delta; must not be used merely to fit RAM.

## Split HDRI

Not used. Full Proof A hold is geometry/BVH, not isolated importance-map size.

## Proof A Water C + H8

- 360x640 / 16 / denoise off
- preflight passed (pre-Cycles RSS 557 MiB, available 14.3 GiB)
- Cycles sync climbed to 13.55 GiB RSS / 1.35 GiB available at 160 s
- watchdog killed Blender (RSS 14.20 GiB KiB-scale / 14204388 KiB)
- PNG: no
- 540x960: not attempted

CURSOR_16GB_RENDER_ENVIRONMENT_INSUFFICIENT

## Larger-memory handoff (read-only, $0)

- minimum system RAM: 24 GiB
- recommended: 32 GiB (48/64 GiB preferred)
- GPU VRAM target: 24 GiB RTX 4090-class
- Blender 4.2.2 / Cycles GPU
- Proof A still only

Read-only RunPod (no CREATE):

1. RTX 4090 / 24 GiB VRAM / secure $0.74/hr / list $0.34/hr
2. L40 / 48 GiB VRAM / secure $0.82/hr
3. RTX 6000 Ada / 48 GiB VRAM / secure $0.84/hr

Host system RAM is not in gpuTypes. Reject any worker with system RAM < 24 GiB.

Estimated cost at $0.74/hr including spin-up:

- 360x640 Proof A: ~$0.20
- 540x960 Proof A: ~$0.30
- 1080x1920 hero still later: ~$0.50

## Worker memory contract

Implemented: worker_memory_contract_v1.py
Tests: worker_memory_contract_v1_test.py + cinematic_standards_test + fail-fast workflow

live pods: []
paid CREATE: 0
RunPod spend: $0

END STATUS: V7_LARGER_MEMORY_RENDER_READY_AWAITING_AUTHORIZATION

FINAL_VIDEO_RENDER_NOT_AUTHORIZED
