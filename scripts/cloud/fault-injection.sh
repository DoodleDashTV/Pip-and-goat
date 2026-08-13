#!/usr/bin/env bash
#
# Prove the provenance gates refuse a paid launch, by breaking them one at a time.
#
#   scripts/cloud/fault-injection.sh [output-file]
#
# Four faults, each restored before the next:
#
#   1. STALE IMAGE     a published, digest-pinned, anonymously pullable image whose
#                      baked render code is not this checkout's. This is the failure
#                      that once got a render past every other gate.
#   2. DRIFTED ASSET   one byte appended to Pip's approved .blend, which is the
#                      "somebody edited a character after preflight" case.
#   3. DRIFTED CODE    one line added to the scene assembly that is baked into the
#                      image, which is the "somebody edited the render" case.
#   4. LAUNCH GUARD    the pin check that runs inside launch.ts, after preflight has
#                      already passed, immediately before money can be spent.
#
# Creates nothing, pulls nothing, spends nothing: reads a public registry, hashes
# local files, and runs the launch script only as far as its pin check. Fault 4
# cannot reach pod creation, because the working tree cannot match a PENDING_REBUILD
# pin; when a real digest is pinned it aborts on the deliberate drift instead.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

OUT="${1:-/dev/stdout}"
PIP_BLEND="production-library/characters/pip_production.blend"
ASSEMBLE="scripts/blender/assemble_scene.py"
BACKUP_DIR="$(mktemp -d)"
STATE_FILE="artifacts/acceptance-1080p/run-state.json"

# The image the cloud re-acceptance render actually ran, with the pins that were
# correct for it at the time. Public and read anonymously.
STALE_IMAGE='ghcr.io/doodledashtv/ddp-runpod-blender@sha256:e80cf523b7cb6d6c3a7c8dedda22e90ca0b8664f65be4c55eb82323083b31c27' # pragma: allowlist secret
STALE_COMMIT='bb5270372ad558e71673fe789260a12fb51a9c6d'
STALE_RENDER_CODE='c4afa39c8c06b32df7352ff0c02675b64ba6da13a0067215182cb07551ca4c91'

restore() {
  [ -f "$BACKUP_DIR/pip.blend" ] && cp "$BACKUP_DIR/pip.blend" "$PIP_BLEND"
  [ -f "$BACKUP_DIR/assemble_scene.py" ] && cp "$BACKUP_DIR/assemble_scene.py" "$ASSEMBLE"
  rm -rf "$BACKUP_DIR"
}
trap restore EXIT

exec > >(tee "$OUT") 2>&1

echo "=== FAIL-CLOSED FAULT INJECTION @ $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "commit: $(git rev-parse HEAD)"
echo

cp "$PIP_BLEND" "$BACKUP_DIR/pip.blend"
cp "$ASSEMBLE" "$BACKUP_DIR/assemble_scene.py"
PIP_SHA_BEFORE="$(sha256sum "$PIP_BLEND" | cut -d' ' -f1)"
ASSEMBLE_SHA_BEFORE="$(sha256sum "$ASSEMBLE" | cut -d' ' -f1)"

echo "----- FAULT 1: a stale published image, pinned by digest, correctly labelled -----"
IMAGE_REF="$STALE_IMAGE" \
EXPECTED_COMMIT="$STALE_COMMIT" \
EXPECTED_RENDER_CODE="$STALE_RENDER_CODE" \
  pnpm cloud:verify-image 2>&1 | grep -vE "^\s*$|^>|ELIFECYCLE|ERR_PNPM|^/workspace/packages|^undefined$"
echo "  -> expected: FAIL RENDER_CODE_MISMATCH"
echo

echo "----- FAULT 2: one byte appended to Pip's approved model -----"
printf '\x00' >> "$PIP_BLEND"
pnpm cloud:preflight-offline 2>&1 | grep -E "^\[(PASS|FAIL)\] (0|4|ASSETFP) |^PREFLIGHT"
cp "$BACKUP_DIR/pip.blend" "$PIP_BLEND"
echo "  -> expected: FAIL ASSETFP, and FAIL 0 because the gate run measured other bytes"
echo "  restored: $([ "$(sha256sum "$PIP_BLEND" | cut -d' ' -f1)" = "$PIP_SHA_BEFORE" ] && echo yes || echo NO)"
echo

echo "----- FAULT 3: one line added to the scene assembly baked into the image -----"
echo "# fault injection" >> "$ASSEMBLE"
pnpm cloud:fingerprints 2>&1 | grep -E "^RENDER_"
cp "$BACKUP_DIR/assemble_scene.py" "$ASSEMBLE"
echo "  -> expected: a render-code fingerprint that is not the pinned one"
echo "  restored: $([ "$(sha256sum "$ASSEMBLE" | cut -d' ' -f1)" = "$ASSEMBLE_SHA_BEFORE" ] && echo yes || echo NO)"
echo

echo "----- FAULT 4: the launch-time pin check, after preflight has passed -----"
mkdir -p "$(dirname "$STATE_FILE")"
if [ -f "$STATE_FILE" ]; then
  echo "  a real run-state.json is present; not touching it, and not running launch.ts"
else
  cat > "$STATE_FILE" <<'JSON'
{
  "jobId": "fault-injection-not-a-real-job",
  "manifestKey": "jobs/fault-injection-not-a-real-job/manifest.json",
  "gpuTypeId": "NVIDIA GeForce RTX 4090",
  "rate4090": 0.74,
  "startupStatusKey": "jobs/fault-injection-not-a-real-job/startup-status.json",
  "statusKey": "jobs/fault-injection-not-a-real-job/status.json"
}
JSON
  pnpm --filter @doodle-dash/database exec tsx ../../scripts/cloud/acceptance-1080p/launch.ts 2>&1 \
    | grep -E "PHASE B|abort_fingerprint_drift|ABORT:" | head -20
  LAUNCH_EXIT="${PIPESTATUS[0]}"
  rm -f "$STATE_FILE"
  echo "  -> expected: ABORT before any Runpod call, exit 2, no pod, \$0"
fi
echo

echo "=== all faults restored ==="
git status --porcelain -- "$PIP_BLEND" "$ASSEMBLE" | sed 's/^/  DIRTY /'
echo "  pip.blend         $(sha256sum "$PIP_BLEND" | cut -d' ' -f1)"
echo "  assemble_scene.py $(sha256sum "$ASSEMBLE" | cut -d' ' -f1)"
