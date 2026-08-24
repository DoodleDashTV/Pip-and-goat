#!/usr/bin/env bash
set -euo pipefail

die() { echo "VERIFY_ABORT: $*" >&2; exit 1; }
SHORT_COMMIT="$(git rev-parse --short HEAD)"
EVIDENCE="artifacts/worker-image/$SHORT_COMMIT"
mkdir -p "$EVIDENCE"
IMAGE_REPO="${IMAGE_REPO:?IMAGE_REPO is required}"
BUILD_TAG="$IMAGE_REPO:$SHORT_COMMIT"

prove() {
  local path="$1"
  docker run --rm --entrypoint test "$BUILD_TAG" -f "$path" || die "missing baked file $path"
  echo "BAKED $path"
}

prove /opt/ddp-worker/src/character-master.js
prove /opt/ddp-worker/src/character-source-materialize.js
prove /opt/ddp-worker/src/character-artifacts.js
prove /opt/ddp-worker/src/character-capability.js
prove /opt/ddp-worker/src/character-download-gate.js
prove /opt/ddp-worker/src/character-stream-hash.js
prove /opt/ddp-worker/src/character-worker-entry.js
prove /opt/ddp-worker/src/prove-authorized-download-entrypoint.js
prove /opt/ddp-worker/blender/characters/build_character.py
prove /opt/ddp-worker/blender/characters/execute.py
prove /opt/ddp-worker/blender/characters/common/stages.py
prove /opt/ddp-worker/character-capability.json

CAPABILITY="$(docker run --rm --entrypoint cat "$BUILD_TAG" /opt/ddp-worker/character-capability.json)"
printf '%s\n' "$CAPABILITY" | tee "$EVIDENCE/character-capability.json"
echo "$CAPABILITY" | grep -q '"characterMasterCapable": true' || die "capability missing characterMasterCapable"
echo "$CAPABILITY" | grep -q '"characterDepartmentStageCount": 26' || die "capability stage count is not 26"
echo "$CAPABILITY" | grep -q 'CHARACTER_MASTER_BUILD' || die "capability missing CHARACTER_MASTER_BUILD"
echo "$CAPABILITY" | grep -q '"goatMaterializerBaked": true' || die "materializer not baked"
echo "$CAPABILITY" | grep -q '"schema": "TIVVLEJOY_CHARACTER_WORKER_CAPABILITY_V2"' || die "capability schema is not V2"
echo "$CAPABILITY" | grep -q '"characterDepartmentBaked": true' || die "department not baked"
echo "$CAPABILITY" | grep -q '"liveCharacterDepartmentCapable": true' || die "live department not capable"
echo "$CAPABILITY" | grep -q '"realSourceDownloadCodeBaked": true' || die "real download code not baked"
echo "$CAPABILITY" | grep -q '"authorizedRealSourceDownloadCapable": true' || die "authorized download not capable"
echo "$CAPABILITY" | grep -q '"durableArtifactPersistenceCapable": true' || die "durable artifact persistence not capable"
echo "$CAPABILITY" | grep -q 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V4' || die "V4 authorization binding missing"
echo "$CAPABILITY" | grep -q 'TIVVLEJOY_CHARACTER_MASTER_DISPATCH_V4' || die "V4 entrypoint missing"
echo "$CAPABILITY" | grep -q '"defaultExecutionMode": "dry-run"' || die "default mode is not dry-run"
echo "$CAPABILITY" | grep -q '"mandatoryDryRun": false' || die "mandatoryDryRun must be false"
echo "$CAPABILITY" | grep -q '"requiresPaidAuthorization": true' || die "paid authorization requirement missing"
echo "$CAPABILITY" | grep -q '"sourceWritesForbidden": true' || die "source write protection missing"
echo "$CAPABILITY" | grep -q '"syntheticLivePathVerified": true' || die "synthetic live path not marked verified"
echo "$CAPABILITY" | grep -q '"realGoatSourceTested": false' || die "real Goat must remain untested"
echo "$CAPABILITY" | grep -q '"realGoatSourceBaked": false' || die "real Goat source must not be baked"
echo "$CAPABILITY" | grep -q '"goatProductionReady": false' || die "goatProductionReady must stay false"

BLENDER_OUT="$(docker run --rm --entrypoint blender "$BUILD_TAG" --version | head -1)"
echo "$BLENDER_OUT" | tee "$EVIDENCE/blender-version.txt"
echo "$BLENDER_OUT" | grep -q '4.2.2' || die "container Blender is not 4.2.2"

ARCH="$(docker image inspect "$BUILD_TAG" --format '{{.Architecture}}')"
echo "architecture=$ARCH" | tee "$EVIDENCE/architecture.txt"
[ "$ARCH" = "amd64" ] || die "image architecture is $ARCH, expected amd64"

bash scripts/cloud/prove-authorized-download-entrypoint.sh "$BUILD_TAG" "$EVIDENCE/authorized-download-entrypoint"

echo "CHARACTER_WORKER_IMAGE_VERIFIED"
