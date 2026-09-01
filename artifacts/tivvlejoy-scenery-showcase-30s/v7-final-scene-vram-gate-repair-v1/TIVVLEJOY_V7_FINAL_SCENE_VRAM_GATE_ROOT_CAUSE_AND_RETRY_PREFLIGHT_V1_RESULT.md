# TIVVLEJOY_V7_FINAL_SCENE_VRAM_GATE_ROOT_CAUSE_AND_RETRY_PREFLIGHT_V1_RESULT

## Definitive root cause

**A. A normal RTX 4090-class GPU was rejected by an exact 24-GiB integer boundary.**

The V2 worker failed in `HOST_AND_LAUNCH_CONTRACT` with `FINAL_HOST_CONTRACT_FAILED` / `VRAM_BELOW_24GIB`. That exact message is `assertHostResources` joining blockers, not `assertRtx4090` (`VRAM below 24 GiB`). The model check never ran.

The gate is **image-embedded** in digest `sha256:1807fac1b13db900251c57ad4d5de7b0dab24cee660b31aa94cd9d0c0183498b`. Host-side launcher reuse of that digest is forbidden.

- B is not supported: CREATE requested Secure `NVIDIA GeForce RTX 4090`.
- C is not the primary cause: `nvidia-smi` `nounits` `memory.total` is MiB.
- D is not supported: an RTX 4090 is a 24 GB class GPU.

Honesty: pod `zq4lfe0xyknzc7` discarded nvidia-smi stdout. **24564 MiB is the documented class value**, not a captured value from that pod.

## Failed-run GPU / VRAM telemetry

| Field | Value |
|---|---|
| Requested GPU SKU | `NVIDIA GeForce RTX 4090` |
| CREATE gpuTypeId | `NVIDIA GeForce RTX 4090` |
| Cloud type | SECURE |
| Assigned nvidia-smi name | **NOT_CAPTURED** |
| RunPod machine.gpuDisplayName after terminate | **UNAVAILABLE** |
| raw `memory.total` | **NOT_CAPTURED** |
| raw `memory.free` | **NOT_QUERIED** (`measureVram` asked only `name,memory.total`) |
| Documented RTX 4090 class `memory.total` | `24564` (MiB, nounits) |
| 24564 as MiB | 24564 |
| 24564 as GiB | 23.98828125 |
| 24564 as decimal GB | 25.760577024 |
| Configured minimum before | **24576 MiB** (`24 * 1024`) |
| Comparison before | `Number(vramMiB) < 24576` |
| Responsible | `workers/runpod-blender/src/final-launch-contract-v1.js` `assertHostResources` (failed-image line ~118) |
| Measure | `workers/runpod-blender/src/scenery-showcase-original14.js` `measureVram` (failed-image line ~86) |

## Before / after gate

**Before (digest 1807fac1):** `REQUIRED_VRAM_MIB = 24 * 1024` = 24576; compare `Number(vramMiB) < 24576`; missing nvidia-smi became `{vramMiB: 0}`; model check after host resources; free VRAM not queried.

**After (digest fc8a9aaa):** `REQUIRED_VRAM_MIB = 24500`; compare integer `vramTotalMiB < 24500`; GPU identity still `/rtx\s*4090/i` fail-closed; total and free both parsed and kept separate; missing/malformed/ambiguous telemetry fails; 16 GiB and 20 GiB still fail; wrong model with enough memory still fails.

**Safety margin:** documented class 24564 MiB minus floor 24500 MiB = **64 MiB**. Floor is **4020 MiB** above 20 GiB (20480) and **8100 MiB** above 16 GiB (16384).

## Image decision

Faulty gate was **embedded in the immutable worker image**. Digest `1807fac1…` is ineligible and was not reused. New linux/amd64 FINAL image was published and inspected with **zero RunPod CREATE**.

**Valid next digest:** `sha256:fc8a9aaa0f921fb200db959acdc301ea400bd5e2cb421be510c909d6c7cf49ca`  
**Image source commit:** `e5e4d36323e65dfc32963d0c5c357d3c32bafc46`

Inspect: Entrypoint `/opt/nvidia/nvidia_entrypoint.sh`; Cmd `node ./src/scenery-showcase-original14-entry.js`; WorkingDir `/opt/ddp-worker`; Blender 4.2.2; six-shot cameras; Camera C lock; frame 210 = `TJ_SHOT_02_CAM`; `v3CompAUsed: false`; checkpoint and visual-proof modules present; Water D remains locked in pin/source; platform linux/amd64.

## Changed files

- `workers/runpod-blender/src/final-launch-contract-v1.js`
- `workers/runpod-blender/src/scenery-showcase-original14.js`
- `workers/runpod-blender/test/final-launch-contract-v1.test.js`
- `workers/runpod-blender/Dockerfile.scenery-showcase-final`
- `config/cloud/scenery-showcase-final-image.json`
- `scripts/cloud/v7-final-scene-visual-proof/execute_paid.py`
- `scripts/cloud/v7-final-scene-visual-proof/preflight.py`
- `artifacts/tivvlejoy-scenery-showcase-30s/v7-final-image-build-v1/IMAGE_INSPECT.json`
- `artifacts/tivvlejoy-scenery-showcase-30s/v7-final-scene-vram-gate-repair-v1/*`

## Tests and CI

Local: `final-launch-contract-v1.test.js`, `visual-proof-contract-v1.test.js`, `frame-checkpoint-v1.test.js`, `cinematic_camera_contract_v1_test`, `cinematic_water_lock_v1_test`, preflight.

Coverage: standard 4090 24576 PASS; documented 24564 PASS; 24499 FAIL; 20 GiB FAIL; 16 GiB FAIL; wrong model with 24576 FAIL; missing/malformed nvidia-smi FAIL; MiB/GiB/decimal-GB conversions; Camera C / six-shot / Water D no-regression.

CI: GHA `TivvleJoy Scenery FINAL Worker Image V1` on `e5e4d363` **success** (run 33453053455). Fail-fast guardrails success.

## Flags

- `paidCreate`: 0
- `RunPod CREATE contacted`: false
- `livePods`: []
- PR #169: **OPEN / DRAFT / UNMERGED / NOT READY**
- `V7_FINAL_VIDEO_RENDER_READY_AWAITING_AUTHORIZATION`: NO
- `FINAL_VIDEO_RENDER_NOT_AUTHORIZED`: true
- V3 paid visual-proof authorization: **safely issuable, not issued**
