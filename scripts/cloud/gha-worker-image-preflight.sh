#!/usr/bin/env bash
#
# Zero-cost preflight for the branch-scoped worker-image GitHub Actions job.
# Runs before GHCR login or docker build. Does not create a Pod or contact RunPod.
#
set -euo pipefail

EXPECTED_BRANCH="cursor/tivvlejoy-runpod-worker-startup-watchdog-73f1"

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

OUT_DIR="${RUNNER_TEMP:-/tmp}/tivvlejoy-worker-image-preflight"
mkdir -p "$OUT_DIR"

pnpm cloud:fingerprints | tee "$OUT_DIR/fingerprints.txt"
RENDER_CODE_SHA256="$(awk '/^RENDER_CODE_SHA256 /{print $2}' "$OUT_DIR/fingerprints.txt")"
RENDER_ASSET_SHA256="$(awk '/^RENDER_ASSET_SHA256 /{print $2}' "$OUT_DIR/fingerprints.txt")"
[ "${#RENDER_CODE_SHA256}" -eq 64 ] || die "render-code fingerprint is not a sha256"
[ "${#RENDER_ASSET_SHA256}" -eq 64 ] || die "render-asset fingerprint is not a sha256"

ASSEMBLE_SCENE_SHA256="$(sha256sum scripts/blender/assemble_scene.py | cut -d' ' -f1)"
EXPECTED_BLENDER="$(sed -n 's/.*BLENDER_VERSION=\([0-9][0-9.]*\).*/\1/p' workers/runpod-blender/Dockerfile | head -1)"
[ -n "$EXPECTED_BLENDER" ] || die "could not read BLENDER_VERSION from Dockerfile"

set +e
pnpm cloud:verify-image >"$OUT_DIR/old-pin-verify.txt" 2>&1
OLD_RC=$?
set -e
cat "$OUT_DIR/old-pin-verify.txt"
if [ "$OLD_RC" -eq 0 ] || ! grep -q 'RENDER_CODE_MISMATCH' "$OUT_DIR/old-pin-verify.txt"; then
  die "old pinned image must fail closed with RENDER_CODE_MISMATCH"
fi
echo "OLD_PIN=STALE/REFUSED code=RENDER_CODE_MISMATCH"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "SOURCE_COMMIT=$SOURCE_COMMIT"
    echo "RENDER_CODE_SHA256=$RENDER_CODE_SHA256"
    echo "RENDER_ASSET_SHA256=$RENDER_ASSET_SHA256"
    echo "ASSEMBLE_SCENE_SHA256=$ASSEMBLE_SCENE_SHA256"
    echo "BLENDER_VERSION=$EXPECTED_BLENDER"
  } >> "$GITHUB_OUTPUT"
fi

echo "SOURCE_COMMIT=$SOURCE_COMMIT"
echo "RENDER_CODE_SHA256=$RENDER_CODE_SHA256"
echo "RENDER_ASSET_SHA256=$RENDER_ASSET_SHA256"
echo "ASSEMBLE_SCENE_SHA256=$ASSEMBLE_SCENE_SHA256"
echo "BLENDER_VERSION=$EXPECTED_BLENDER"
echo "PREFLIGHT_OK"
