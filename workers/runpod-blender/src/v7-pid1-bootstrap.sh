#!/bin/sh
# PID-1 boundary for V7 Proof A. No secrets. Flush immediately. Then exec.
# Writes HTTP-readable marker files so startup proof does not need provider logs.
set -eu
MARK_DIR="${V7_MARK_DIR:-/tmp/v7-startup-markers}"
mkdir -p "$MARK_DIR"

log() {
  printf '%s\n' "$1"
}

iso_now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

write_marker() {
  stage="$1"
  extra="$2"
  log "$extra"
  printf '%s\n' "$extra" > "${MARK_DIR}/${stage}.json"
}

write_marker BOOTSTRAP_ENTERED "{\"schema\":\"TIVVLEJOY_WORKER_STARTUP_MARKERS_V1\",\"stage\":\"BOOTSTRAP_ENTERED\",\"at\":\"$(iso_now)\",\"pid\":$$,\"event\":\"BOOTSTRAP_ENTERED\"}"

if command -v node >/dev/null 2>&1; then
  ver="$(node -p process.version 2>/dev/null || true)"
  write_marker NODE_AVAILABLE "{\"schema\":\"TIVVLEJOY_WORKER_STARTUP_MARKERS_V1\",\"stage\":\"NODE_AVAILABLE\",\"at\":\"$(iso_now)\",\"event\":\"NODE_AVAILABLE\",\"version\":\"${ver}\"}"
else
  write_marker NODE_AVAILABLE "{\"schema\":\"TIVVLEJOY_WORKER_STARTUP_MARKERS_V1\",\"stage\":\"NODE_AVAILABLE\",\"at\":\"$(iso_now)\",\"event\":\"NODE_AVAILABLE\",\"version\":null}"
  log '{"event":"BOOTSTRAP_EXIT","code":127,"reason":"NODE_MISSING"}'
  exit 127
fi

if [ -x /opt/nvidia/nvidia_entrypoint.sh ]; then
  exec /opt/nvidia/nvidia_entrypoint.sh "$@"
fi
exec "$@"
