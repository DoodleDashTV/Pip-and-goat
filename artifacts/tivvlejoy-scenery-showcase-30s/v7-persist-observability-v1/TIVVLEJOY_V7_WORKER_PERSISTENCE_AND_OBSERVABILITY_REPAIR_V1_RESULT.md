# TIVVLEJOY_V7_WORKER_PERSISTENCE_AND_OBSERVABILITY_REPAIR_V1_RESULT

starting branch: cursor/tivvlejoy-scenery-showcase-30s-v1-73f1
starting SHA: f19a3c6c34ef436422a391f1b3c171517ed09983
repair SHA: 33392912496f0ca2f775e1d20c295d1e666e7f22
final SHA: fc81fcf11bfcac0d9a23600fb2c6f8a0b4070672
required ancestor: d1e3c15242b1f59bc7e5f187a5daa5c31be93e1c
required ancestor preserved: YES
PR state: #169 OPEN DRAFT UNMERGED NOT READY

ROOT CAUSE OF THE 300-SECOND EXIT:
application timer in workers/runpod-blender/src/v7-proof-a-boot.js
armed by launch env V7_STARTUP_PROOF_SECONDS=300
code default if unset: 180 seconds
then process.exit(0)

NOT the cause: PID-1 wrapper, NVIDIA entrypoint, RunPod platform lifecycle,
or a test-only wrapper that outlived Node.

launch-configuration-only: NO
reason: removing the env still exits at the 180s default; /ready also lacked
HTTP markers/digest/heartbeat/bootId, so observability is image-owned.

FILES / CONFIGURATION CHANGED:
- workers/runpod-blender/src/v7-proof-a-boot.js
- workers/runpod-blender/src/v7-pid1-bootstrap.sh
- workers/runpod-blender/Dockerfile.v7-proof-a-startup
- workers/runpod-blender/test/v7-proof-a-startup-proof.test.js
- workers/runpod-blender/test/v7-persist-12m.test.js
- workers/runpod-blender/test/v7-production-lifetime-scan.test.js
- scripts/cloud/v7-proof-a-paid/startup_proof_v1.py
- scripts/cloud/v7-proof-a-paid/startup_proof_paid.py
- .github/workflows/tivvlejoy-v7-proof-a-startup-image.yml
- .github/workflows/tivvlejoy-worker-startup-canary-v1.yml
- config/cloud/v7-proof-a-startup-image.json
- artifacts/tivvlejoy-scenery-showcase-30s/v7-persist-observability-v1/*

IMAGE REBUILD REQUIRED: YES
new immutable digest: sha256:fca7f9afc0d3e239a8302b381e2407148386782684e8ef2ee9e97d75d7cddf24
parent digest: sha256:7e8bf43653ebd81d1f3fd4452bb2181a1dc11fd97c0ee69789d67b072eebf673
source commit: 33392912496f0ca2f775e1d20c295d1e666e7f22
GHA publish run: 33343931770
entrypoint: /opt/ddp-worker/src/v7-pid1-bootstrap.sh
cmd: node ./src/v7-proof-a-boot.js
anonymous pull: YES (29 layers, 2164911704 B)
dockerArgs: node ./src/v7-proof-a-boot.js

LOCAL / CI PERSISTENCE:
local node 12m: PASS holdMs=720000 pid=39191 bootId=boot-12m heartbeats=48 uptimeMs=720264 exit=0
GHA container 12m: PASS pid=1 bootId=gha-persist-12m heartbeats=48 uptimeMs=720454
same PID throughout: YES
same boot identifier throughout: YES
heartbeat advances: YES (0 → 48, monotonic)
no uptime reset: YES
readiness after SIGKILL: non-200 / connection refused
SIGTERM: exit 0, server closed, /ready down
no V7_STARTUP_PROOF_SECONDS in production configuration: PASS

HTTP STARTUP PROOF (no provider logs):
/ready and /startup-proof return TIVVLEJOY_V7_STARTUP_PROOF_V2
observed on GHA: BOOTSTRAP_ENTERED, NODE_AVAILABLE, IMAGE_PROCESS_STARTED,
NODE_ENTRY_STARTED, WORKER_MODULE_LOADED, WORKER_LISTENING, WORKER_READY
plus pid, bootId, uptimeMs, sourceSha, parentDigest, heartbeatCount, heartbeatAt
imageDigest is pin-owned and injected at launch via V7_IMAGE_DIGEST
baked image identity: sourceSha + parentDigest

SECRET-LEAK SCAN: PASS
health JSON contains no credentials, tokens, env dumps, or signed URLs
containsSecret() unit test PASS
GHA /startup-proof body reviewed: no secrets

REMAINING BLOCKERS:
none for zero-cost gates
paid CREATE is not authorized
FINAL_VIDEO_RENDER_NOT_AUTHORIZED

SUBSEQUENT PAID PROOF B (not authorized, estimate only):
purpose: one RunPod CREATE of the new digest, HTTP /startup-proof markers,
180s persist observe, terminate
estimated wall: 8 minutes (about 2 min pull + 3 min observe + cleanup)
estimated spend at $0.74/hr: $0.07
maximum spend to authorize: $0.10 USD
CREATE allowance to authorize: 1
no Blender, no R2, no final render, no second CREATE

V7_PAID_STARTUP_PROOF_B_AWAITING_AUTHORIZATION: YES

STOP.
