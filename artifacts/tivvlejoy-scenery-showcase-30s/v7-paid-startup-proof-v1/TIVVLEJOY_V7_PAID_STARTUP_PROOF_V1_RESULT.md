# TIVVLEJOY_V7_PAID_STARTUP_PROOF_V1_RESULT

starting branch: cursor/tivvlejoy-scenery-showcase-30s-v1-73f1
starting remote tip at authorization: 28a58e7490e822083de736bb8cfefec90a552b54
launch SHA: dcfcf19b429217a1c8ea645dbc534fc5caed3edd
final SHA: 9ac16a31ca9384b6327efaa23ce09362b17ce98f
required ancestor: d1e3c15242b1f59bc7e5f187a5daa5c31be93e1c
required ancestor is ancestor of launch/remote tip: YES
PR state: #169 OPEN DRAFT UNMERGED NOT READY

WHY 28a58e74 IS LISTED AFTER REPORTED FINAL SHA d1e3c152:
d1e3c152 is the content commit that pinned overlay digest sha256:868b7d5e796df7cd8e3c96df39a1eb2560344f492ed3d081f0bf6e3416a65142 and recorded the zero-cost 180s proofs. 28a58e74 is the later stamp commit whose parent is d1e3c152. It only writes `final SHA: d1e3c152...` into the result markdown. The required identity check is ancestry, not tip equality. Launch then added dcfcf19b (this launcher) on top of 28a58e74. d1e3c152 remains an ancestor.

IDENTITY RECONCILIATION (zero-cost, before CREATE):
remote tip at arming: 28a58e7490e822083de736bb8cfefec90a552b54
remote tip at CREATE: dcfcf19b429217a1c8ea645dbc534fc5caed3edd
ancestor d1e3c152: YES
pinned digest match: YES sha256:868b7d5e796df7cd8e3c96df39a1eb2560344f492ed3d081f0bf6e3416a65142
anonymous overlay pull: YES (29 layers, 2164909971 B)
live pods before CREATE: []
PR #169: OPEN DRAFT
quote: SECURE RTX 4090 $0.74/hr High

AUTHORIZATION:
id: TIVVLEJOY_V7_PAID_STARTUP_PROOF_AUTHORIZATION_V1
maximum additional spend: $0.10 USD
paid CREATE allowance: 1
CREATE performed: 1
automatic retry: no
second CREATE: no
authorization consumed: YES (first CREATE)

WORKER:
pod ID: fegncnyyr98pfi
pod name: tj-v7-sup-v1
GPU: SECURE NVIDIA GeForce RTX 4090
hourly rate: $0.74
minMemoryInGb: 24
containerDiskInGb: 40
dockerArgs: node ./src/v7-proof-a-boot.js
image digest: sha256:868b7d5e796df7cd8e3c96df39a1eb2560344f492ed3d081f0bf6e3416a65142
image rebuild: no
Blender invoked: no
R2 invoked: no

STARTUP TIMELINE (UTC):
2026-08-30T22:40:42.952Z POD_CREATED fegncnyyr98pfi
2026-08-30T22:40:42.759Z HOST_ASSIGNED desiredStatus=RUNNING $0.74/hr
~2026-08-30T22:41:33Z CONTAINER_STARTED (uptime 17s sampled shortly after)
2026-08-30T22:42:53.932Z /ready 200 WORKER_READY pid=51
2026-08-30T22:43:14.300Z /ready 200 pid=51
2026-08-30T22:43:34.135Z through 2026-08-30T22:46:09.280Z /ready 200 pid=51 every ~15s
2026-08-30T22:44:45Z uptime=197 pid still 51
2026-08-30T22:45:53.738Z 180s observe from first timestamped /ready is met
2026-08-30T22:46:09.280Z last /ready 200
2026-08-30T22:46:24.765Z /ready HTTPError (V7_STARTUP_PROOF_SECONDS=300 process exit)
2026-08-30T22:46:48.002Z GraphQL uptime reset to 5 (post-exit recycle)
2026-08-30T22:47:13.335Z terminate_requested
after terminate: live pods []

MARKERS:
from container logs: none (RunPod GraphQL/REST have no containerLog field; GET https://api.runpod.io/v2/pods/{id}/logs opened a chunked stream that hung the launcher poll loop)
from /ready HTTP: WORKER_READY (schema TIVVLEJOY_V7_STARTUP_HEALTH_V1, ok=true, pid=51)
BOOTSTRAP_ENTERED: not retrieved from paid logs
NODE_AVAILABLE: not retrieved from paid logs
IMAGE_PROCESS_STARTED: not retrieved from paid logs
NODE_ENTRY_STARTED: not retrieved from paid logs
WORKER_MODULE_LOADED: not retrieved from paid logs
WORKER_LISTENING: not retrieved from paid logs
WORKER_READY: YES via /ready
HEARTBEAT: not retrieved from paid logs
R2_CLIENT_STARTED: no
BLENDER_EXEC_STARTED: no
ordered paid-log markers: NO

READINESS:
/ready success: YES
first timestamped ready: 2026-08-30T22:42:53.932Z
last successful ready: 2026-08-30T22:46:09.280Z
ready span: 196.3 s
required observe: 180 s
stable pid: 51
continuing HEARTBEAT log markers: NO (logs unavailable)

RESTART / CRASH LOOP:
during 180s observe: none (pid 51 stable; uptime rose 17 → 197)
after 300s stay-alive exit: uptime reset to 5, then /ready failed
that recycle is the designed node exit after V7_STARTUP_PROOF_SECONDS=300, not a startup crash-loop
launcher restartCount: 0 (poll loop never ran; hung inside first fetch_logs)

ACTUAL SPEND:
pod runtime: 391.1 s
rate: $0.74/hr
actual RunPod spend: $0.0804
under $0.10 cap: YES
CREATE count: 1

CLEANUP:
pod terminated: YES
live pods: []
live-pod count: 0

EXACT BLOCKER:
CONTAINER_LOGS_UNAVAILABLE_AND_STAY_ALIVE_EXIT

The file-shaped boot did start. /ready returned WORKER_READY for 196.3 s on a stable pid. The official marker contract still failed because container stdout was never retrieved, so BOOTSTRAP_ENTERED → WORKER_LISTENING and HEARTBEAT were not proven on the paid pod. The launcher never completed its own observe loop because fetch_logs blocked on a chunked logs URL. The 300 s stay-alive then exited and uptime reset. Fail-closed. No second CREATE.

END STATUS: V7_PAID_STARTUP_PROOF_FAILED
V7_PROOF_A_RENDER_READY_AWAITING_AUTHORIZATION: NO
NO FURTHER CREATE AUTHORIZED
FINAL_VIDEO_RENDER_NOT_AUTHORIZED

STOP.
