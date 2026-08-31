# TIVVLEJOY_V7_FINAL_SCENE_APPROVAL_AND_RENDER_HARDENING_V1

Zero paid RunPod execution. No CREATE. No 900-frame render. PR #169 stays draft.

## Identity

- starting branch/SHA: `cursor/tivvlejoy-scenery-showcase-30s-v1-73f1` / `4c812b5147d0b4e0ce5e961fd315cde4d0fa6078`
- required content ancestor `f833d3dfcfaa7e97d5254bbe6b3b1b02f64fce01`: YES
- required historical ancestor `d1e3c15242b1f59bc7e5f187a5daa5c31be93e1c`: YES
- PR #169: OPEN / DRAFT / UNMERGED / NOT READY
- paid CREATE count: 0
- RunPod spend: $0
- live pods: []
- RunPod contacted: no

## 1. Visual-gate repair

Composition repairs landed in the locked scene, not in gate labels:

- SHOT_01 meadow: 9 camera-scale macro plates and 1.15 m far-field rolls (`y > 8`). Camera C corridor unchanged.
- Camera C waterline: 6 corridor stones now sit inside HERO_X_MIN/MAX (previous stones were outside the frustum).
- Gate J: cavity collars lift the left rock/film/bank triple points (`-9.60` lift ≥ 0.18).

Geometry contracts PASS. Pixel suite did **not** run.

V44 remains 19/22 PASS. **E / F / J stay FAIL** until 540×960 Cycles/32 frames exist and are judged.

Six-shot previews / contact sheet: **not generated**.

This VM:

- MemTotal 15.64 GiB, available ~14.5 GiB, swap 0
- Blender: missing
- Docker: missing
- Prior cinematic Cycles kill: Proof A 360×640 / 16 samples reached 13.55 GiB RSS and was killed at 14.20 GiB
- Minimum RAM to attempt previews: **24 GiB**
- Assets were not reduced to force a pass

## 2. Path independence

FINAL/hero rebuilds no longer default to `/tmp/o14-lookdev`, `/tmp/o14-v3-source`, `/tmp/o14-v4-source`, or `/tmp/lookdev`.

Runtime roots: `TIVVLEJOY_SCENERY_ASSETS_ROOT`, `TIVVLEJOY_SCENERY_OUTPUT_ROOT`, `TIVVLEJOY_SCENERY_SCRIPTS_ROOT`. Missing files fail closed with name + byte receipts. Credentials are never printed.

## 3. Production launcher

`node ./src/scenery-showcase-original14-entry.js` now builds:

```
blender --background --factory-startup --python-exit-code 1 \
  --python cinematic_valley_world_v1.py -- \
  --resolution 1080x1920 --fps 30 --start-frame 1 --end-frame 900 \
  --samples 256 --profile FINAL --water-variant D --hero-rebuild v3
```

Fail-closed on EEVEE, Water C, upscale, 48-sample override, timeout < 1440, Botaniq Full, host RAM < 24 GiB, VRAM < 24 GiB, disk < 60 GiB, or a non-4090 GPU.

Automated tests: PASS.

## 4. Recoverability

Content-addressed R2 checkpoint module uploads PNG frames with SHA-256 + render identity, readback-verifies, and resumes only on hash+identity match. Filename-only skip is forbidden. Encode is blocked until frames 1–900 are verified. MP4 is uploaded and read back by SHA-256. No automatic second CREATE.

Tests: PASS.

## 5. FINAL image

Dockerfile exists: `workers/runpod-blender/Dockerfile.scenery-showcase-final`

Static inspect: CMD is `node ./src/scenery-showcase-original14-entry.js`. It does not launch `scenery-showcase-entry-v2.js` or `v7-proof-a-boot.js`.

**Digest: none. Image not built. Image not pinned. Publish blocked** until pixel gates pass.

The original14 auto-publish workflow is now gated on a published FINAL pin, so this push cannot silently publish a LOOKDEV image.

## 6. Next safe paid step (not issued)

Name: `TIVVLEJOY_V7_FINAL_SCENE_VISUAL_PROOF_AUTHORIZATION_V1`

Issuable now: **NO**

Would be: new FINAL digest, Water D, six representative shot frames, Cycles GPU, one CREATE, no retry, auto terminate, ceiling ≤ $0.50.

Old V7_PROOF_A Water C authorization remains unused.

## Cost estimate (unchanged)

- Measured CPU 1080×1920 / 192 samples: 440 s/frame
- Estimated RTX 4090 FINAL 256: 40–75 s/frame → 10.5–19.5 h → **$7.80–$14.50** at $0.74/hr
- Video hard ceiling if later authorized: $20 / 1440 min

## Flags

- `V7_FINAL_SCENE_VISUAL_PROOF_READY_AWAITING_AUTHORIZATION`: **NO**
- `V7_FINAL_VIDEO_RENDER_READY_AWAITING_AUTHORIZATION`: **NO**
- `FINAL_VIDEO_RENDER_NOT_AUTHORIZED`
