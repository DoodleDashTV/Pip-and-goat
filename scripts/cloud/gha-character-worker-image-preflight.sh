#!/usr/bin/env bash
set -euo pipefail

EXPECTED_BRANCH="cursor/tivvlejoy-goat-v5-blender-runtime-repair-73f1"

die() { echo "PREFLIGHT_ABORT: $*" >&2; exit 1; }

echo "github.sha=${GITHUB_SHA:-}"
echo "github.ref_name=${GITHUB_REF_NAME:-}"

[ "${GITHUB_REF_NAME:-}" = "$EXPECTED_BRANCH" ] \
  || die "workflow is scoped to $EXPECTED_BRANCH (got ${GITHUB_REF_NAME:-empty})"

if [ -n "$(git status --porcelain)" ]; then
  git status --short
  die "working tree is not clean"
fi

SOURCE_COMMIT="$(git rev-parse HEAD)"
if [ -n "${GITHUB_SHA:-}" ] && [ "$SOURCE_COMMIT" != "$GITHUB_SHA" ]; then
  die "HEAD $SOURCE_COMMIT does not match GITHUB_SHA $GITHUB_SHA"
fi

grep -q 'BLENDER_VERSION=4.2.2' workers/runpod-blender/Dockerfile \
  || die "Dockerfile must pin Blender 4.2.2"
grep -q 'BLENDER_BIN=/usr/local/bin/blender' workers/runpod-blender/Dockerfile \
  || die "Dockerfile must expose the Blender runtime path"
grep -q "const useBlender = mode.mode === EXECUTION_MODE_LIVE" workers/runpod-blender/src/character-master.js \
  || die "live character department must always use Blender"
grep -q "env.BLENDER_BIN || 'blender'" workers/runpod-blender/src/character-master.js \
  || die "live character department must default to the Blender executable"
test -f workers/runpod-blender/src/character-master.js || die "character-master.js missing"
test -f workers/runpod-blender/src/character-source-materialize.js || die "character-source-materialize.js missing"
test -f scripts/blender/characters/build_character.py || die "build_character.py missing"
test -f scripts/blender/characters/common/stages.py || die "department stages missing"
grep -q 'CHARACTER_MASTER_BUILD' workers/runpod-blender/src/character-job-kinds.js \
  || die "CHARACTER_MASTER_BUILD constant missing"
grep -q 'ARG DDP_RENDER_ASSET_SHA256=unknown' workers/runpod-blender/Dockerfile \
  || die "render-asset build argument missing"
grep -q 'ddp.render.asset.sha256="${DDP_RENDER_ASSET_SHA256}"' workers/runpod-blender/Dockerfile \
  || die "render-asset OCI label missing"
grep -q -- '--build-arg "DDP_RENDER_ASSET_SHA256=$RENDER_ASSET_SHA256"' scripts/cloud/build-worker-image.sh \
  || die "render-asset fingerprint is not passed into docker build"

# Scan only the character runtime and this workflow. Do not scan this
# preflight script itself — the needle strings live here as the tripwire.
if grep -n "createPodForBenchmark\|podFindAndDeployOnDemand\|ALLOW_PAID_GPU_LAUNCH=true" \
  workers/runpod-blender/src/character-master.js \
  workers/runpod-blender/src/character-source-materialize.js \
  workers/runpod-blender/src/character-job-kinds.js \
  workers/runpod-blender/src/character-download-gate.js \
  workers/runpod-blender/src/character-worker-entry.js \
  workers/runpod-blender/src/worker.js \
  .github/workflows/tivvlejoy-worker-image-build.yml; then
  die "paid-mutation tripwire tripped"
fi

OUT_DIR="${RUNNER_TEMP:-/tmp}/tivvlejoy-character-worker-image-preflight"
mkdir -p "$OUT_DIR"
pnpm cloud:fingerprints | tee "$OUT_DIR/fingerprints.txt"
RENDER_CODE_SHA256="$(awk '/^RENDER_CODE_SHA256 /{print $2}' "$OUT_DIR/fingerprints.txt")"
RENDER_ASSET_SHA256="$(awk '/^RENDER_ASSET_SHA256 /{print $2}' "$OUT_DIR/fingerprints.txt")"
[ "${#RENDER_CODE_SHA256}" -eq 64 ] || die "render-code fingerprint is not a sha256"
[ "${#RENDER_ASSET_SHA256}" -eq 64 ] || die "render-asset fingerprint is not a sha256"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "SOURCE_COMMIT=$SOURCE_COMMIT"
    echo "RENDER_CODE_SHA256=$RENDER_CODE_SHA256"
    echo "RENDER_ASSET_SHA256=$RENDER_ASSET_SHA256"
    echo "BLENDER_VERSION=4.2.2"
  } >> "$GITHUB_OUTPUT"
fi

echo "SOURCE_COMMIT=$SOURCE_COMMIT"
echo "RENDER_CODE_SHA256=$RENDER_CODE_SHA256"
echo "PREFLIGHT_OK"
