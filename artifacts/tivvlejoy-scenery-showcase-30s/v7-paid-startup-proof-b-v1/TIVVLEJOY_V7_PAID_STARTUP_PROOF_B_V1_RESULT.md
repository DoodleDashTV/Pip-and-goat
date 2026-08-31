# TIVVLEJOY_V7_PAID_STARTUP_PROOF_B_V1_RESULT

branch: cursor/tivvlejoy-scenery-showcase-30s-v1-73f1
remote tip: 29e4d9d95a07693fe1d5a555adfb3b1b05441782
required ancestor: d1e3c15242b1f59bc7e5f187a5daa5c31be93e1c
ancestor of tip: True
why 28a58e74 follows d1e3c152: d1e3c152 is the content commit that pinned the overlay and recorded the 180s proofs. 28a58e74 is the later stamp commit whose parent is d1e3c152; it only writes 'final SHA: d1e3c152...' into the result markdown. The required check is ancestry, not tip equality.
digest: sha256:fca7f9afc0d3e239a8302b381e2407148386782684e8ef2ee9e97d75d7cddf24
PR state: #169 OPEN DRAFT UNMERGED NOT READY

pod ID: px0b8pexnvd56v
GPU: SECURE NVIDIA GeForce RTX 4090
hourly rate: $0.74
CREATE count: 1
restart count: 0
runtime: 230.3 s
actual spend: $0.0473

startup timeline:
- 2026-08-31T10:57:15.005790+00:00 POD_CREATED uptime=None
- 2026-08-31T10:57:58.810943+00:00 WORKER_READY uptime=None
- 2026-08-31T10:58:19.793387+00:00 CONTAINER_STARTED uptime=13
- 2026-08-31T11:01:04.293505+00:00 OBSERVE_COMPLETE uptime=163

markers: BOOTSTRAP_ENTERED, NODE_AVAILABLE, IMAGE_PROCESS_STARTED, NODE_ENTRY_STARTED, WORKER_MODULE_LOADED, WORKER_LISTENING, WORKER_READY
missing: none
ordered: True
heartbeat count: 12 first=0 last=12
pid continuity: 50 -> 50
bootId continuity: 52f811f3-b2c8-4cb1-bdaf-6d55f5739ad8 -> 52f811f3-b2c8-4cb1-bdaf-6d55f5739ad8
ready HTTP: {"urlHost": "runpod-proxy-18080", "status": 200, "path": "/startup-proof", "body": {"schema": "TIVVLEJOY_V7_STARTUP_PROOF_V2", "ok": true, "event": "WORKER_READY", "url": "/startup-proof", "pid": 50, "bootId": "52f811f3-b2c8-4cb1-bdaf-6d55f5739ad8", "uptimeMs": 187846, "startedAt": "2026-08-31T10:57:56.399Z", "imageDigest": "sha256:fca7f9afc0d3e239a8302b381e2407148386782684e8ef2ee9e97d75d7cddf24", "sourceSha": "29e4d9d95a07693fe1d5a555adfb3b1b05441782", "parentDigest": "sha256:7e8bf43653ebd81d1f3fd4452bb2181a1dc11fd97c0ee69789d67b072eebf673", "workerEntrypoint": "v7-proof-a-boot.js", "pid1": "v7-pid1-bootstrap.sh", "markers": [{"stage": "BOOTSTRAP_ENTERED", "at": "2026-08-31T10:57:56Z", "via": "file"}, {"stage": "NODE_AVAILABLE", "at": "2026-08-31T10:57:56Z", "via": "file"}, {"stage": "IMAGE_PROCESS_STARTED", "at": "2026-08-31T10:57:56.400Z", "via": "file"}, {"stage": "NODE_ENTRY_STARTED", "at": "2026-08-31T10:57:56.402Z", "via": "file"}, {"stage": "WORKER_MODULE_LOADED", "at": "2026-08-31T10:57:56.403Z", "via": "file"}, {"stage": "WORKER_LISTENING", "at": "2026-08-31T10:57:56.406Z", "via": "file"}, {"stage": "WORKER_READY", "at": "2026-08-31T10:57:56.406Z", "via": "file"}], "heartbeatCount": 12, "heartbeatAt": "2026-08-31T11:00:56.416Z", "heartbeatAtMs": 1788174056416, "restart": false, "blenderInvoked": false, "r2Invoked": false}}
cleanup confirmed: True
live pods: []
Blender invoked: False
R2 invoked: False
image rebuild: False
second CREATE: False

END STATUS: V7_PAID_STARTUP_PROOF_B_PASSED
V7_PROOF_A_RENDER_READY_AWAITING_AUTHORIZATION: YES

FINAL_VIDEO_RENDER_NOT_AUTHORIZED
NO PR MERGE / NOT READY / NO PRODUCTION DEPLOY
