#!/usr/bin/env bash
set -euo pipefail

die() { echo "SYNTHETIC_LIVE_PATH_ABORT: $*" >&2; exit 1; }
IMAGE="${1:-${BUILD_TAG:-}}"
[ -n "$IMAGE" ] || die "image tag is required"
EVIDENCE="${2:-artifacts/worker-image/synthetic-live-path}"
mkdir -p "$EVIDENCE"

docker run --rm \
  --entrypoint node \
  -e CHARACTER_WORKER_ROOT=/opt/ddp-worker \
  -e BLENDER_BIN=blender \
  -e PYTHON_BIN=python3 \
  -e TIVVLEJOY_FORBID_REAL_GOAT_DOWNLOAD=true \
  -e ALLOW_PAID_GPU_LAUNCH=false \
  -e CLOUD_RENDER_ENABLED=false \
  -e SYNTHETIC_LIVE_PATH_RECEIPT=/tmp/synthetic-live-path.receipt.json \
  "$IMAGE" \
  /opt/ddp-worker/src/prove-synthetic-live-path.js \
  | tee "$EVIDENCE/prove-stdout.json"

docker run --rm --entrypoint cat "$IMAGE" /opt/ddp-worker/character-capability.json \
  | tee "$EVIDENCE/character-capability.json"

echo "$IMAGE" | grep -qi 'runpod' && true
echo "SYNTHETIC_LIVE_PATH_VERIFIED $IMAGE"
