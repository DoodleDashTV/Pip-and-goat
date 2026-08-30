# TIVVLEJOY_V7_PAID_WORKER_STARTUP_ROOT_CAUSE_AND_RETRY_PREFLIGHT_V2_RESULT

starting branch: cursor/tivvlejoy-scenery-showcase-30s-v1-73f1
starting SHA: ab6a212a2dc1c763264ab90fac8fae7e90b8063e
final branch: cursor/tivvlejoy-scenery-showcase-30s-v1-73f1
final SHA: 98656ddac4b44e52f42702f0b2416e697aa3d57c
PR state: #169 OPEN DRAFT UNMERGED NOT READY

PRIOR PAID FAILURE:
pod: pnmqjjnnfxupfe
runtime: 1213.3 s
actual spend: $0.2494
Blender started: no
container started: no

RUNPOD STATE:
host assigned: yes (SECURE RTX 4090, $0.74/hr, desiredStatus RUNNING)
machine: RTX 4090; machine ID not returned by the available list query
runtime: negative uptime for the whole rental; never >= 0
last status: Rented by User at 2026-08-30 15:29:06Z; pod is now gone from the API
startup evidence: LAST_CONFIRMED_STARTUP_STAGE = HOST_ASSIGNED_OR_IMAGE_PULLING

IMAGE:
ref: ghcr.io/<org>/ddp-runpod-blender@sha256:7e8bf43653ebd81d1f3fd4452bb2181a1dc11fd97c0ee69789d67b072eebf673
digest: exists
manifest: anonymous token + manifest HTTP 200
architecture: linux/amd64
compressed size: 2164906933 B (2.016 GiB)
layers: 25; largest ~1311 MiB
public pull: YES
registry auth required: NO for this digest (unauthenticated OCI 401, then anonymous token succeeds)
RunPod pull proven: NO (API does not expose pull state; contemporaneous uptime never became positive)

CAN AN UNAUTHENTICATED RUNTIME PULL THE EXACT PINNED DIGEST?
YES

ENTRYPOINT:
image entrypoint: /opt/nvidia/nvidia_entrypoint.sh
image CMD: node ./src/scenery-showcase-entry-v2.js
runtime dockerArgs (failed run): nested `sh -c 'node -e "..."'`
compatible: NO
finding: dockerArgs must be extra argv for the NVIDIA entrypoint, matching CMD shape `node <file-or--e>`. The paid run used a nested shell string. Goat GraphQL creates without dockerArgs have reached runtime; scenery GraphQL creates with dockerArgs historically have not.

LOCAL/CI STARTUP CANARY:
image pull: anonymous registry canary PASS (this VM has no Docker)
container start: not executed on this VM (DOCKER_NOT_AVAILABLE)
Node start: boot script syntax PASS; argv-shape canary PASS
Blender executable: not executed on this VM
Blender version: image label 4.2.2
GHA 33321945159: false negative (banner truncation). Both extra-argv probes exited 0.
GHA 33322215513 on 1c7a2fee: PASS
  docker=true; publicPull=true; nvidiaBanner=true
  NODE_ENTRY_STARTED after CUDA banner
  Blender 4.2.2 LTS after CUDA banner
  no GPU on the runner; NVIDIA driver warning expected
  paid CREATE 0; RunPod not contacted
result: TIVVLEJOY_WORKER_STARTUP_CANARY_V1 ok=true locally and on GHA.
  Container start on this digest + extra argv is proven.

R2:
manifest: present (10 files)
sources: present
identities: PASS (H8 and owned 15k source SHAs unchanged)
result: no large re-upload; entry.js updated only

ACTUAL HOST MEMORY CONTRACT:
implemented: yes (host_memory_receipt_v1 + entry.js before large downloads)
MemTotal required: 24 GiB hard stop; 32 GiB preferred warning
GPU VRAM required: 24 GiB
runtime receipt required: yes; Blender must not start without it

STARTUP MARKERS:
implemented: yes
list: IMAGE_PROCESS_STARTED, NODE_ENTRY_STARTED, R2_CLIENT_STARTED, SOURCE_MANIFEST_FETCH_STARTED, SOURCE_MANIFEST_FETCH_COMPLETE, HOST_MEMORY_RECEIPT_WRITTEN, BLENDER_EXEC_STARTED, BLENDER_PROCESS_STARTED, CYCLES_DEVICE_VERIFIED, RENDER_STARTED

STARTUP FAIL-FAST:
implemented: yes
container-start timeout: 480 s without positive uptime
worker-marker timeout: 180 s after container start without host-memory receipt
startup spend cap behavior: $0.10 distinct from $0.40 render cap; terminate if still pre-container

ROOT CAUSE:
PROBABLE

exact cause: the paid worker never entered container runtime. Confirmed image facts: public linux/amd64 digest, NVIDIA ENTRYPOINT, scenery CMD. The launch dockerArgs were a nested shell blob incompatible with that ENTRYPOINT argv shape. Combined with the same GraphQL on-demand path that previously left scenery pods at runtime=null. Not Blender. Not scene memory. Cold pull of 2.0 GiB compressed could take minutes but a prior anonymous CI pull of this digest finished in 79 s, so 20 minutes with no uptime is not explained by pull size alone.

FIXES:
implemented: compatible dockerArgs; staged markers; host RAM receipt before downloads; startup spend cap; container/worker fail-fast; optional RunPod registry-auth id (unused; image is public); reusable GHA canary

ZERO-COST TESTS:
results: worker_memory_contract_v1_test PASS; startup_canary_v1_test PASS including NVIDIA-banner parser; startup_canary_v1 ok on this VM (no Docker); v7-proof-a-boot.test PASS; GHA 33321945159 false negative; GHA 33322215513 PASS (node + Blender 4.2.2 LTS past NVIDIA banner); live pods []; paid CREATE 0

live pods: []
paid CREATE: 0
RunPod spend: $0

PAID_PROOF_A_RETRY_READY_AWAITING_AUTHORIZATION
FINAL_VIDEO_RENDER_NOT_AUTHORIZED

STOP.
