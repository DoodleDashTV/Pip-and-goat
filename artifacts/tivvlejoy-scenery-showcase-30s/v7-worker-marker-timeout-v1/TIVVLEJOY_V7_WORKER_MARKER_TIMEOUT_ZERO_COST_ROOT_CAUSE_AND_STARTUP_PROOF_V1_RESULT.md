# TIVVLEJOY_V7_WORKER_MARKER_TIMEOUT_ZERO_COST_ROOT_CAUSE_AND_STARTUP_PROOF_V1_RESULT

starting branch: cursor/tivvlejoy-scenery-showcase-30s-v1-73f1
starting SHA: eaa002c5ff37d5501fde466b31b5136561462bd7
final branch: cursor/tivvlejoy-scenery-showcase-30s-v1-73f1
final SHA: PENDING_STAMP
PR state: #169 OPEN DRAFT UNMERGED NOT READY

immutable failed image digest: sha256:7e8bf43653ebd81d1f3fd4452bb2181a1dc11fd97c0ee69789d67b072eebf673
corrected image digest: sha256:868b7d5e796df7cd8e3c96df39a1eb2560344f492ed3d081f0bf6e3416a65142
corrected image pinned: YES

Entrypoint (failed digest): /opt/nvidia/nvidia_entrypoint.sh
Cmd (failed digest): node ./src/scenery-showcase-entry-v2.js
WorkingDir: /opt/ddp-worker
User: unset/root
platform: linux/amd64
containerDiskInGb: 40

ACTUAL ROOT CAUSE:
IMMEDIATE_PROCESS_EXIT caused by GraphQL dockerArgs string application.

The paid command was `node -e (async()=>{...const r2=require...})()`.
Direct evidence:
- bash -c of that exact string: exit 2, `syntax error near unexpected token '('`
- space-split token count: 6, so `node -e` gets a truncated program and throws `SyntaxError: Unexpected end of input`
- GHA on the failed digest: `docker run IMAGE node -e "console.log('NODE_ENTRY_STARTED')"` succeeds
- therefore the image/entrypoint/Node/Blender/platform are not the failure

CONTAINER_STARTED ↔ IMAGE_PULLING is the provider uptime clock resetting on that crash-loop (0 then negative). Not host reprovisioning, missing interpreter, wrong platform, disk exhaustion, or missing env. Retained RunPod logs for 0msnqqdigglatj are gone (REST 404, live pods []).

FIX:
- reject node -e / metacharacter dockerArgs
- file-shaped `node ./src/v7-proof-a-boot.js`
- PID-1 bootstrap: BOOTSTRAP_ENTERED, NODE_AVAILABLE
- thin overlay image baked and pinned
- launcher crash-loop detector; paid CREATE blocked until this overlay is pinned

files changed:
- scripts/cloud/v7-proof-a-paid/docker_args_v1.py
- scripts/cloud/v7-proof-a-paid/startup_proof_v1.py
- scripts/cloud/v7-proof-a-paid/startup_markers_v1.py
- scripts/cloud/v7-proof-a-paid/startup_canary_v1_test.py
- scripts/cloud/v7-proof-a-paid/launch.py
- workers/runpod-blender/src/v7-proof-a-boot.js
- workers/runpod-blender/src/v7-pid1-bootstrap.sh
- workers/runpod-blender/Dockerfile.v7-proof-a-startup
- workers/runpod-blender/test/v7-proof-a-startup-proof.test.js
- .github/workflows/tivvlejoy-v7-proof-a-startup-image.yml
- .github/workflows/tivvlejoy-worker-startup-canary-v1.yml
- config/cloud/scenery-showcase-worker-image.json
- artifacts/tivvlejoy-scenery-showcase-30s/v7-worker-marker-timeout-v1/*

commits created:
- 7f2386ed Fix the V7 worker-marker timeout: file-shaped boot, not node -e.
- (stamp commit follows)

local startup transcript (run 1, ordered):
BOOTSTRAP_ENTERED (PID-1 sh)
NODE_AVAILABLE v22.14.0
IMAGE_PROCESS_STARTED
NODE_ENTRY_STARTED
WORKER_MODULE_LOADED r2Skipped blenderSkipped
WORKER_LISTENING :18081
WORKER_READY
HEARTBEAT x12 through 180093 ms

three-run stability:
run1 stayedAlive 180.3s healthOk
run2 stayedAlive 180.2s healthOk
run3 stayedAlive 180.2s healthOk
no restarts

180-second health/heartbeat: PASS (/ready 200 WORKER_READY; 12 heartbeats)

GHA container proof (run 33338402293):
BOOTSTRAP_ENTERED pid=1
NODE_AVAILABLE v20.20.2
NVIDIA banner
IMAGE_PROCESS_STARTED → WORKER_READY → HEARTBEAT through 180090 ms
three consecutive container starts PASS

Blender invoked: no
R2 invoked: no
RunPod CREATE count: 0
actual added spend: $0
live pods: []

PAID_STARTUP_PROOF_READY_AWAITING_NEW_AUTHORIZATION: YES
FINAL_VIDEO_RENDER_READY: NO

STOP.
