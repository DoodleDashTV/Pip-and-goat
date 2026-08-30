# TIVVLEJOY_V7_PAID_PROOF_A_RETRY_AUTHORIZATION_V1_RESULT

starting branch: cursor/tivvlejoy-scenery-showcase-30s-v1-73f1
required starting SHA: 47e1e2b11ff16b23ea34cc9b55e5e165036d865b
launch SHA: 6db7be2ca4bf006dd7735e9fb09a7c313c9673f1
final branch: cursor/tivvlejoy-scenery-showcase-30s-v1-73f1
final SHA: PENDING_STAMP
PR state: #169 OPEN DRAFT UNMERGED NOT READY

AUTHORIZATION:
id: TIVVLEJOY_V7_PAID_PROOF_A_RETRY_AUTHORIZATION_V1
maximum additional spend: $0.40 USD
paid CREATE allowance: 1
CREATE performed: 1
automatic retry: no
second CREATE: no

PREFLIGHT:
ok: yes
required starting SHA is ancestor of launch SHA
ENTRYPOINT-compatible dockerArgs: yes (node -e, not nested sh -c)
image digest: sha256:7e8bf43653ebd81d1f3fd4452bb2181a1dc11fd97c0ee69789d67b072eebf673
H8 / owned 15k source identities: unchanged
water lock: unchanged
Camera C / scene: unchanged
image rebuild: no

WORKER:
pod ID: 0msnqqdigglatj
pod name: tj-v7-proof-a-r1
GPU: SECURE RTX 4090
hourly rate: $0.74
minMemoryInGb requested: 32
GPU VRAM catalog: 24 GiB
desiredStatus: RUNNING until terminate

STARTUP-MARKER SEQUENCE (launcher timeline, UTC):
2026-08-30T21:19:09.087Z POD_CREATED
2026-08-30T21:19:09.692Z IMAGE_PULLING uptime=null
2026-08-30T21:20:27.319Z CONTAINER_STARTED uptime=0
2026-08-30T21:20:58.406Z IMAGE_PULLING uptime=-6
2026-08-30T21:22:00.463Z CONTAINER_STARTED uptime=0
2026-08-30T21:22:16.002Z IMAGE_PULLING uptime=-14
2026-08-30T21:22:47.045Z CONTAINER_STARTED uptime=0
2026-08-30T21:23:18.099Z IMAGE_PULLING uptime=-9
2026-08-30T21:23:49.185Z CONTAINER_STARTED uptime=0
2026-08-30T21:23:50.283Z terminate_requested

WORKER MARKERS WRITTEN BY THE CONTAINER:
IMAGE_PROCESS_STARTED: no
NODE_ENTRY_STARTED: no
R2_CLIENT_STARTED: no
SOURCE_MANIFEST_FETCH_STARTED: no
SOURCE_MANIFEST_FETCH_COMPLETE: no
HOST_MEMORY_RECEIPT_WRITTEN: no
BLENDER_EXEC_STARTED: no
BLENDER_PROCESS_STARTED: no
CYCLES_DEVICE_VERIFIED: no
RENDER_STARTED: no

HOST MEMORY / GPU VRAM RECEIPT:
written: no
host RAM measured: no
GPU VRAM measured: no

PROCESS START:
Node: no
R2: no
Blender: no
Cycles: no
rendering: no

PROOF A ARTIFACTS:
A_CREEK_BANK_WATER_TEST_C.png: none
A_CREEK_BANK_WATER_TEST_C_PHONE.png: none
RENDER_RECEIPT.json: none
status.json: none
startup-markers.json: none
host-memory-receipt.json: none
validation: none

ACTUAL SPEND:
pod runtime: 282.6 s
rate: $0.74/hr
actual RunPod spend: $0.0581
under $0.10 startup cap: yes
under $0.40 total cap: yes

CLEANUP:
pod terminated: yes
live pods: []
live-pod count: 0

EXACT BLOCKER:
WORKER_MARKER_TIMEOUT

The first uptime>=0 sample was at 78.7 s. Host-memory receipt and every worker marker were still absent 180 s later. Runtime uptime flickered between negative values and 0 and never became a rising positive clock. No R2 worker outputs were written. Fail-closed terminate ran. No second CREATE.

END STATUS: V7_PROOF_A_PAID_EXECUTION_FAILED
NO FURTHER RETRY AUTHORIZED
FINAL_VIDEO_RENDER_NOT_AUTHORIZED

STOP.
