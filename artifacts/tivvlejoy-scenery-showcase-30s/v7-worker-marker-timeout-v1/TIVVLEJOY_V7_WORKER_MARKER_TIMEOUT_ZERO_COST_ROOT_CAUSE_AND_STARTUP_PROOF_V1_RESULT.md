# TIVVLEJOY_V7_WORKER_MARKER_TIMEOUT_ZERO_COST_ROOT_CAUSE_AND_STARTUP_PROOF_V1_RESULT

starting branch: cursor/tivvlejoy-scenery-showcase-30s-v1-73f1
starting SHA: eaa002c5ff37d5501fde466b31b5136561462bd7
final branch: cursor/tivvlejoy-scenery-showcase-30s-v1-73f1
final SHA: PENDING_STAMP
PR state: #169 OPEN DRAFT UNMERGED NOT READY

FAILED IMAGE DIGEST:
sha256:7e8bf43653ebd81d1f3fd4452bb2181a1dc11fd97c0ee69789d67b072eebf673
platform: linux/amd64
Entrypoint: /opt/nvidia/nvidia_entrypoint.sh
Cmd: node ./src/scenery-showcase-entry-v2.js
WorkingDir: /opt/ddp-worker
User: root (unset)
containerDiskInGb: 40

ACTUAL ROOT CAUSE:
IMMEDIATE_PROCESS_EXIT from GraphQL dockerArgs string application.

The paid dockerArgs were `node -e (async()=>{...const r2=require...})()`.
That string is not a valid extra-argv blob:
- bash -c dies: `syntax error near unexpected token '('` (exit 2)
- space-split yields 6 tokens, so `node -e` receives a truncated program and throws `SyntaxError: Unexpected end of input` (exit 1)

GHA already proved the same digest starts when argv is passed correctly
(`docker run IMAGE node -e "console.log('NODE_ENTRY_STARTED')"`).
The image, Node, Blender 4.2.2, linux/amd64, and NVIDIA entrypoint are not the failure.

The CONTAINER_STARTED ↔ IMAGE_PULLING flicker is the provider uptime clock
resetting on an immediate crash-loop (uptime 0, then negative, then 0).
It is not host reprovisioning, wrong platform, missing Node, disk exhaustion,
or a missing environment variable. Retained RunPod REST/GraphQL state for
pod 0msnqqdigglatj is gone (REST 404, live pods []).

FIX:
Reject node -e / metacharacter dockerArgs.
Use file-shaped `node ./src/v7-proof-a-boot.js`.
Add PID-1 bootstrap markers before Node.
Bake those files in a thin overlay image.
Launcher treats uptime 0→negative as WORKER_CRASH_LOOP and refuses paid
CREATE until the overlay digest is pinned.

RunPod CREATE count: 0
actual added spend: $0
live pods: []
FINAL_VIDEO_RENDER_READY: NO
