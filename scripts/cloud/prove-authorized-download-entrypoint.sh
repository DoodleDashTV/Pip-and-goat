#!/usr/bin/env bash
set -euo pipefail

die() { echo "AUTHORIZED_DOWNLOAD_ENTRYPOINT_ABORT: $*" >&2; exit 1; }
IMAGE="${1:-${BUILD_TAG:-}}"
[ -n "$IMAGE" ] || die "image tag is required"
EVIDENCE="${2:-artifacts/worker-image/authorized-download-entrypoint}"
mkdir -p "$EVIDENCE"

docker run --rm \
  --entrypoint node \
  -e CHARACTER_WORKER_ROOT=/opt/ddp-worker \
  -e PYTHON_BIN=python3 \
  -e TIVVLEJOY_FORBID_REAL_GOAT_DOWNLOAD=true \
  -e ALLOW_PAID_GPU_LAUNCH=false \
  -e CLOUD_RENDER_ENABLED=false \
  -e AUTHORIZED_DOWNLOAD_ENTRYPOINT_RECEIPT=/tmp/authorized-download-entrypoint.receipt.json \
  "$IMAGE" \
  /opt/ddp-worker/src/prove-authorized-download-entrypoint.js \
  | tee "$EVIDENCE/prove-stdout.json"

grep -Eq '"ok":[[:space:]]*true' "$EVIDENCE/prove-stdout.json" \
  || die "in-image proof did not report ok"
grep -Eq '"authorizedDownloadInvoked":[[:space:]]*1' "$EVIDENCE/prove-stdout.json" \
  || die "in-image proof did not invoke the authorized downloader exactly once"

echo "AUTHORIZED_DOWNLOAD_ENTRYPOINT_VERIFIED $IMAGE"
