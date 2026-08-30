#!/bin/sh
# PID-1 boundary for V7 Proof A. No secrets. Flush immediately. Then exec.
set -eu
log() {
  printf '%s\n' "$1"
}
log "{\"event\":\"BOOTSTRAP_ENTERED\",\"pid\":$$,\"argv\":\"$*\"}"
if command -v node >/dev/null 2>&1; then
  ver="$(node -p process.version 2>/dev/null || true)"
  log "{\"event\":\"NODE_AVAILABLE\",\"version\":\"${ver}\"}"
else
  log '{"event":"NODE_AVAILABLE","version":null}'
  log '{"event":"BOOTSTRAP_EXIT","code":127,"reason":"NODE_MISSING"}'
  exit 127
fi
if [ -x /opt/nvidia/nvidia_entrypoint.sh ]; then
  exec /opt/nvidia/nvidia_entrypoint.sh "$@"
fi
exec "$@"
