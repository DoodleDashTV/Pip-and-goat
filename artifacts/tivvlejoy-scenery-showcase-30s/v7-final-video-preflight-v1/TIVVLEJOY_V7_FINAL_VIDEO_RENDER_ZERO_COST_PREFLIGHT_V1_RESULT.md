# TIVVLEJOY_V7_FINAL_VIDEO_RENDER_ZERO_COST_PREFLIGHT_V1_RESULT

branch: cursor/tivvlejoy-scenery-showcase-30s-v1-73f1
content SHA: f833d3dfcfaa7e97d5254bbe6b3b1b02f64fce01
parent SHA: 2605cbf13e508e68469646905ccf099d751de755
required ancestor: d1e3c15242b1f59bc7e5f187a5daa5c31be93e1c YES
PR: #169 OPEN DRAFT UNMERGED NOT READY
paid CREATE: 0
image rebuild: no
Blender invoked: no
R2 bytes downloaded: 0

END STATUS: V7_FINAL_VIDEO_RENDER_PREFLIGHT_BLOCKED
V7_FINAL_VIDEO_RENDER_READY_AWAITING_AUTHORIZATION: NO
V7_PROOF_A_RENDER_READY_AWAITING_AUTHORIZATION: YES
FINAL_VIDEO_RENDER_NOT_AUTHORIZED

## 1. Paid Startup Proof B

PASSED and consumed.

- authorization: TIVVLEJOY_V7_PAID_STARTUP_PROOF_B_AUTHORIZATION_V1
- ledger: artifacts/tivvlejoy-scenery-showcase-30s/v7-paid-startup-proof-b-v1/consumption-ledger.json
- pod: px0b8pexnvd56v (tj-v7-sup-b1)
- digest: sha256:fca7f9afc0d3e239a8302b381e2407148386782684e8ef2ee9e97d75d7cddf24
- /ready and /startup-proof: 200 WORKER_READY
- PID: 50 -> 50
- bootId: 52f811f3-b2c8-4cb1-bdaf-6d55f5739ad8 unchanged
- heartbeats: 0 -> 12
- spend: $0.0473
- cleanup: terminated; live pods []
- second CREATE: no

Do not reuse this authorization.

## 2. PROOF_A / PROOF_B naming mismatch

Harmless. They are different gates.

- Proof A is the Water C still / larger-memory cinematic-creek render lineage.
- Proof B is the paid startup persist + HTTP observability proof only.
- The flag `V7_PROOF_A_RENDER_READY_AWAITING_AUTHORIZATION` stayed named PROOF_A because the next paid GPU job in that lineage was a still, not a 30s video.
- Proof B PASSED does not authorize a render.
- That flag = YES means a new paid Proof A still may be requested. It does not mean the final video is ready.

## 3. Live pods and stale authorization files

Live pods at 2026-08-31T11:15:04Z: []
Proof B pod px0b8pexnvd56v: absent
Env armed: SCENERY_SHOWCASE_PAID_AUTHORIZATION UNSET, PAID_EXECUTION_AUTHORIZED UNSET, ALLOW_PAID_GPU_LAUNCH UNSET

Historical standing-auth JSON files still exist and must not be reused:

- PAID_AUTHORIZATION_ORIGINAL14_V1.json authorized=true (540x960 / 12 samples / $2 / 75 min)
- PAID_AUTHORIZATION_V3.json authorized=true
- PAID_AUTHORIZATION_V4.json authorized=true
- PAID_AUTHORIZATION_V5.json authorized=true
- PAID_AUTHORIZATION_V2.json present

No current launcher imports those files. They are stale and inert. They are not a live unused CREATE grant.

Consumed ledgers (fail-closed, correct): Proof B, Proof A startup, Proof A retry, Proof A first CREATE.

## 4. Exact scene and worker command that will launch Blender

There is no published worker that will launch the locked cinematic 30s scene.

If someone launched what is pinned today:

A. Scenery pin sha256:7e8bf43653ebd81d1f3fd4452bb2181a1dc11fd97c0ee69789d67b072eebf673
   - CMD: node ./src/scenery-showcase-entry-v2.js
   - Blender: blender --background --factory-startup --python-exit-code 1 --python /opt/ddp-worker/blender/scenery/showcase_30s.py -- --resolution 1080x1920 --fps 30 --start-frame 1 --end-frame 900 --samples 48
   - Engine: BLENDER_EEVEE_NEXT 48 samples
   - Scene: generic mountain/forest/river/village assemble
   - Camera C / V34 water / Louis lock: NO
   - This is a silent quality reduction. Do not authorize it as FINAL.

B. Proof B overlay sha256:fca7f9afc0d3e239a8302b381e2407148386782684e8ef2ee9e97d75d7cddf24
   - CMD: node ./src/v7-proof-a-boot.js
   - Default: persist /ready. Never starts the 30s showcase.
   - If PAID_EXECUTION_AUTHORIZED=true: downloads Proof A still entry.js and renders one Water C still. Not a video.

C. Locked cinematic path that SHOULD launch, but is not the current pin:
   - CMD: node ./src/scenery-showcase-original14-entry.js
   - Then: scenery-showcase-original14.js
   - Blender: blender --background --factory-startup --python-exit-code 1 --python /opt/ddp-worker/blender/scenery/cinematic_valley_world_v1.py -- --assets-json <original14+Louis> --output-dir <out> --resolution 1080x1920 --fps 30 --start-frame 1 --end-frame 900 --samples 256 --profile FINAL --water-variant D
   - Dockerfile.scenery-showcase-original14 is stale vs current imports (missing cinematic_master_look_v1.py, cinematic_hero_rebuild_v3.py / v5.py, cinematic_water_lock_v1.py and their deps).
   - Hero rebuild v3/v5 still point at /tmp/o14-v3-source and /tmp/o14-v4-source lookdev paths that a fresh pod will not have.
   - Image is not the current pin.

## 5. Locked purchased scenery and visibility

Present in private R2 (list only, 0 bytes downloaded):

- Village Blender 4.2.2 + textures + project + FBX (Cabin04 family)
- Stylized Forest Nature Kit + Stylised EcoKit (forest, flora, rocks)
- LouisBGMountainsV1 (512.1 MiB) — locked hero mountains
- HDRi_JPG_Pack (Image0001 / sk2) + H8 derivative tj_hdri_diag_8k.jpg (identity c41f736d1278b7a61684fa76bd34983c5722e3536ed1d04a7c96c8024c99f65e)
- Water_Mat_GN
- Original-14 14/14 + Louis extra = 3375.1 MiB, under the 4 GiB cap

Not loadable with Original-14 in one materialize:

- Botaniq Full 7.2.0 = 4915.1 MiB, exceeds the 4 GiB cap
- 3DT mountain GLB = 1476.7 MiB, excluded for the same cap; Louis is the visible mountain pack

Camera C is locked for SHOT_02 frames 151-300:
location (2.2, -21.4, 3.40) look (-3.4, -10.2, 1.75) 32 mm

Accepted V34 water is variant D (tuned C):
Cycles IOR 1.33 / transmission 0.80 / metallic 0 / specular 0.50 / 18 cm prism / volume 0.18 / WATER_WIDTH_SCALE 0.30 / BED_WIDTH_SCALE 0.68 / HDRI Z 0.48 / Light Path MAXIMUM(Is Glossy Ray, Is Reflection Ray) / Water_Mat_1
argparse default is D.

Will they actually be visible? Only in the cinematic_valley_world path, and only if that script plus current imports are on the pod and hero overlays resolve real purchased files.

They will not be visible on the published EEVEE showcase path.

Visual gates are not closed:

- V44: E meadow FAIL, F shoreline FAIL, J bank cavity FAIL (19/22)
- Cinematic master 1080 still: professional first impression NO; vegetation cards FAIL; not visually approved
- PRODUCTION_READINESS_V1.json: missing
- VISUAL_APPROVAL_RECEIPT_RESULT: unset
- Temporal approval: missing
- Worker parity: missing

Purchased assets are present. A FINAL-labeled 30s of the locked world is not proven visible at production quality.

## 6. Output specification

Required FINAL contract:

- 30 seconds
- 1080x1920
- 9:16
- 30 fps
- 900 native frames
- no upscale
- no placeholder assets
- no silent quality reduction

The contract exists in cinematic_standards.py and scenery-render-profiles.js FINAL.

The currently pinned paid launcher would violate it (EEVEE 48, generic assemble, CRF 18 in render-core).

## 7. Engine, samples, denoising, frames, encode

FINAL profile (the only legal video label):

- engine: CYCLES
- device: GPU
- samples: 256
- denoise: on
- noiseThreshold: 0.02
- motion blur: on, shutter 0.5
- depth of field: on in the profile; Camera C use_dof is locked false in the cinematic master
- master: 16-bit PNG sequence frame_%04d.png
- color: AgX, look AgX - Medium High Contrast
- frame range: 1-900
- encode: ffmpeg -y -framerate 30 -i frame_%04d.png -c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p -movflags +faststart

Forbidden as FINAL: EEVEE 48, 8-bit master, Lanczos 540→1080, CPU Cycles without a proven GPU miss.

Risk: original14 worker uses SCENERY_SHOWCASE_EEVEE_SAMPLES || profile.samples. launch.ts still sets SCENERY_SHOWCASE_EEVEE_SAMPLES=48, which would silently drop FINAL to 48 samples if that env were reused.

## 8. Memory, texture, asset-path, output storage

- Minimum host RAM: 24 GiB. Recommended: 32-64 GiB. Reject below 24 GiB.
- GPU: SECURE RTX 4090 24 GiB VRAM. Quoted $0.74/hr, stock Low (community list $0.34 is not the launch price).
- Proof A still at 360x640 already reached ~14 GiB RSS on the 16 GiB Cursor VM and was killed. That environment is insufficient.
- Memory contract prediction for the Proof A still subset: ~15 GiB. A 900-frame full valley is heavier.
- Asset materialize: Original-14 + Louis 3375.1 MiB. Cap 4 GiB. Botaniq Full cannot join that set.
- H8 (8192x4096) is the approved lighting HDRI. H4 must not be used to save RAM. Source Image0001 must not be overwritten.
- Texture/path: V3/V5 hero overlays still hardcode /tmp/o14-v3-source and /tmp/o14-v4-source. A paid pod using worker asset dirs will miss flora/rocks/Botaniq unless those paths are staged.
- Disk: 900 × 1080x1920 16-bit PNG ≈ 4-8 GiB plus ~3.4 GiB assets plus BVH/cache. Need ≥60 GiB container disk. launch.ts uses 60 + 20. Original14 image defaults are lower and too small for FINAL 16-bit.
- Output storage: private R2 prefix tivvlejoy-assets/showcases/<jobId>/ plus jobs/<jobId>/status.json. R2 is configured in this environment. Do not print endpoints.

## 9. Checkpoint, validation, MP4, checksum, delivery

Present:

- Per-frame progress file + R2 startup-status ticks every 15 s
- After Blender: verify 900 non-empty PNGs
- ffmpeg encode
- ffprobe resolution + frame count
- SHA-256 of MP4, upload, download, compare readback
- Sample frames 1/180/360/540/720/900
- Fail closed if usage proof or role counts fail

Missing / fatal for a one-CREATE 30s:

- No skip-existing frame resume. cinematic_valley_world_v1.py re-renders 1-900 from scratch.
- Frames stay on local disk only until the end. Pod death loses the sequence.
- original14 default Blender timeout is 55 minutes. That cannot finish 900 Cycles 256 frames.
- Existing launcher hard cost $2 / 120 min (original14 75 min) would kill the job mid-render.
- No second CREATE is allowed, so there is no legal resume pod.

A legal one-CREATE final video must finish all 900 frames, encode, checksum, and cleanup in the same pod.

## 10. RTX 4090 wall time and cost

Measured (not GPU): cinematic master 1080x1920 Cycles 192 samples, CPU fallback, 7 min 20 s (440 s) for one SHOT_02 still.

Estimated GPU 4090 at FINAL 256 samples: 40-75 s/frame.
900 frames: 10.0-18.8 h render + 0.5-1.0 h pull/build/encode/upload.
Expected spend at $0.74/hr: $7.80-$14.50.
Recommended hard maximum: $20.00 USD.
Recommended max runtime: 1440 minutes.
Existing $2.00 / 75-120 min contracts are not enough and must not be reused.

This is an estimate. There is no measured GPU 1080 frame time of the locked scene. A Proof A still on this overlay would produce that number. That still is separately awaiting authorization and is not this preflight.

## 11. Exact bounded authorization for ONE final render CREATE

Name: TIVVLEJOY_V7_FINAL_VIDEO_RENDER_AUTHORIZATION_V1

Issuable now: NO.

The text is in AUTHORIZATION_REQUIRED.txt. It requires one SECURE 4090 CREATE, $20 hard max, 1440 min, no retry, guaranteed terminate/delete, native Cycles FINAL 1080x1920 / 900 / 30 fps, water variant D, and a not-yet-published cinematic FINAL digest.

Do not issue it until:

1. A new immutable image is published that actually runs cinematic_valley_world_v1.py with current imports and resolved asset paths.
2. PRODUCTION_READINESS_V1.json exists and paidFinalAllowed is true.
3. Human visual + temporal approval receipts PASS.
4. Worker parity is proven.
5. The 55-minute Blender timeout and $2 hard-cost contracts are replaced.
6. Checkpoint/resume is either implemented or the hard max is accepted as a single-shot no-resume job.
7. The digest is written into the authorization. Do not leave the digest blank.

## What is ready

- Proof B startup persist: proven and cleaned up
- Private Original-14 + Louis + H8 + Water_Mat objects: present
- FINAL numerical contract: specified
- Water lock and Camera C: specified and locked in source
- R2 + RunPod auth: configured, zero live pods
- A still-only Proof A authorization may still be requested under V7_PROOF_A_RENDER_READY_AWAITING_AUTHORIZATION

## What is not ready

A paid 30-second FINAL CREATE of the locked cinematic world.
