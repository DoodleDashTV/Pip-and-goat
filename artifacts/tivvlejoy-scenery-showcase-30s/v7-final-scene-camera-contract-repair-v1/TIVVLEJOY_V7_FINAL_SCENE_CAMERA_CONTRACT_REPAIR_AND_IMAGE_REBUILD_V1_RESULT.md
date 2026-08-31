# TIVVLEJOY_V7_FINAL_SCENE_CAMERA_CONTRACT_REPAIR_AND_IMAGE_REBUILD_V1_RESULT

Zero RunPod CREATE. Failed digest remains permanently ineligible. New FINAL image published and inspected.

## Root cause

`VISUAL_PROOF` stills-only plus `--hero-rebuild v3` installed V3 Comp A and bound `scene.camera` to `TJ_V3_COMP_A` `(2.05, -21.6, 3.05)` on all seven stills. That bypassed `TJ_SHOT_02_CAM` / Camera C and the six-shot timeline.

## Identity

- starting: `cursor/tivvlejoy-scenery-showcase-30s-v1-73f1` @ `1ddee2f36015142a97f2801a977fdd2464ab1f65`
- image source commit: `c54aecdfc7e6da4f008b5dce8ba47cfe6cb04cfc`
- content ancestor: `d5654510599f5b42919a949c5c4503c5ec1442f1`
- failed image source (ineligible): `577cafe897c122c6b6bf85f03c0b2e6b24e79665`

## Digests

- failed / ineligible forever: `sha256:b176ca65f36290ead95b7e24717751a89cb6e1bb49ea0351d4934f1c3b065bf6`
- new immutable digest: `sha256:1807fac1b13db900251c57ad4d5de7b0dab24cee660b31aa94cd9d0c0183498b`

## Canonical six-shot mapping

| Shot | Frames | Camera | Proof frame |
|---|---|---|---|
| SHOT_01 | 1–150 | TJ_SHOT_01_CAM | 48 |
| SHOT_02 | 151–300 | TJ_SHOT_02_CAM | 210 |
| SHOT_03 | 301–450 | TJ_SHOT_03_CAM | 360 |
| SHOT_04 | 451–600 | TJ_SHOT_04_CAM | 520 |
| SHOT_05 | 601–750 | TJ_SHOT_05_CAM | 680 |
| SHOT_06 | 751–900 | TJ_SHOT_06_CAM | 860 |

## Camera C / frame 210 / Water D

- Camera C: `TJ_SHOT_02_CAM` location `(2.2, -21.4, 3.40)` look `(-3.4, -10.2, 1.75)` 32 mm — verified in published image
- Frame 210: `TJ_SHOT_02_CAM` — V3 Comp A unused
- Water D unchanged: IOR 1.33, transmission 0.80, volume 0.18, WATER_WIDTH_SCALE 0.30

## Inspected image

- Entrypoint: `/opt/nvidia/nvidia_entrypoint.sh`
- Cmd: `node ./src/scenery-showcase-original14-entry.js`
- WorkingDir: `/opt/ddp-worker`
- platform: linux/amd64
- Blender 4.2.2
- six-shot camera contract, Camera C lock, checkpoint, visual-proof modules present
- does not launch scenery-showcase-entry-v2.js or v7-proof-a-boot.js

## Spend / PR

- paid CREATE: 0 · spend: $0.00 · live pods: [] · RunPod contacted: false
- PR #169: OPEN / DRAFT / UNMERGED / NOT READY
- new paid visual-proof authorization safely issuable: YES, against `sha256:1807fac1…` only
- authorization created/consumed this run: NO

## Flags

- E/F/J: BLOCKED_PENDING_PAID_PIXEL_PROOF
- V7_FINAL_SCENE_VISUAL_PROOF_READY_AWAITING_AUTHORIZATION: YES
- V7_FINAL_VIDEO_RENDER_READY_AWAITING_AUTHORIZATION: NO
- FINAL_VIDEO_RENDER_NOT_AUTHORIZED
