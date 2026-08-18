#!/usr/bin/env bash
#
# Build, verify, publish and pin the Runpod worker image.
#
# The Blender scene-assembly code is baked into the image, so an image is only as
# good as the commit it was built from: a pullable but stale image once rendered
# pre-repair lighting while every other gate passed. This script makes the whole
# chain one command and refuses to continue at the first disagreement.
#
#   1. the working tree must be clean, so the build has an exact commit
#   2. compute the render-code fingerprint from the repository
#   3. build for linux/amd64, stamped with commit, build time and fingerprint
#      (the build itself re-computes the fingerprint over the copied files and
#      fails if the stamp disagrees)
#   4. re-verify the fingerprint independently inside the built image
#   5. push, and read the digest back out of the registry
#   6. verify the published labels anonymously, the way preflight will
#   7. print the constants to pin
#
# Requires: docker (linux/amd64 capable), and a GHCR login with packages:write.
#
#   scripts/cloud/ghcr-login.sh
#   scripts/cloud/build-worker-image.sh
#
# Nothing here creates a GPU pod or costs anything beyond registry storage.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

IMAGE_REPO="${IMAGE_REPO:-ghcr.io/doodledashtv/ddp-runpod-blender}"
DOCKERFILE="workers/runpod-blender/Dockerfile"

die() { echo "BUILD_ABORT: $*" >&2; exit 1; }
step() { echo; echo "===== $* ====="; }

command -v docker >/dev/null 2>&1 || die "docker is not available; this cannot run in a sandbox without a container runtime"

step "1. working tree must be clean"
if [ -n "$(git status --porcelain)" ]; then
  git status --short
  die "uncommitted changes: the image would carry code that exists on no commit"
fi
SOURCE_COMMIT="$(git rev-parse HEAD)"
SHORT_COMMIT="$(git rev-parse --short HEAD)"
if [ -n "${GITHUB_SHA:-}" ] && [ "$SOURCE_COMMIT" != "$GITHUB_SHA" ]; then
  die "HEAD $SOURCE_COMMIT does not match GITHUB_SHA $GITHUB_SHA"
fi
echo "source commit: $SOURCE_COMMIT"

IMAGE_TAG="${IMAGE_TAG:-$SHORT_COMMIT}"
case "$IMAGE_TAG" in
  latest|production|stable)
    die "refusing mutable production tag: $IMAGE_TAG"
    ;;
esac

step "2. render-code and render-asset fingerprints from the repository"
FINGERPRINTS="$(pnpm cloud:fingerprints | tail -3)"
RENDER_CODE_SHA256="$(printf '%s\n' "$FINGERPRINTS" | awk '/^RENDER_CODE_SHA256 /{print $2}')"
RENDER_ASSET_SHA256="$(printf '%s\n' "$FINGERPRINTS" | awk '/^RENDER_ASSET_SHA256 /{print $2}')"
[ "${#RENDER_CODE_SHA256}" -eq 64 ] || die "render-code fingerprint is not a sha256: $RENDER_CODE_SHA256"
[ "${#RENDER_ASSET_SHA256}" -eq 64 ] || die "render-asset fingerprint is not a sha256: $RENDER_ASSET_SHA256"
echo "render code:   $RENDER_CODE_SHA256"
echo "render assets: $RENDER_ASSET_SHA256"

EXPECTED_BLENDER="$(sed -n 's/.*BLENDER_VERSION=\([0-9][0-9.]*\).*/\1/p' "$DOCKERFILE" | head -1)"
[ -n "$EXPECTED_BLENDER" ] || die "could not read BLENDER_VERSION from $DOCKERFILE"
echo "blender version (Dockerfile): $EXPECTED_BLENDER"

BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EVIDENCE="artifacts/worker-image/$SHORT_COMMIT"
mkdir -p "$EVIDENCE"

step "3. build (the build asserts the fingerprint over the files it copied)"
BUILD_TAG="$IMAGE_REPO:$IMAGE_TAG"
docker build \
  -f "$DOCKERFILE" \
  --platform linux/amd64 \
  --build-arg "DDP_SOURCE_COMMIT=$SOURCE_COMMIT" \
  --build-arg "DDP_WORKER_BUILD_TIME=$BUILD_TIME" \
  --build-arg "DDP_RENDER_CODE_SHA256=$RENDER_CODE_SHA256" \
  -t "$BUILD_TAG" \
  . 2>&1 | tee "$EVIDENCE/01-docker-build.txt"

step "4. verify the fingerprint independently inside the built image"
# Recomputed from the files actually present in the image, not from the label.
IN_IMAGE="$(docker run --rm --entrypoint node "$BUILD_TAG" /opt/ddp-worker/src/provenance.js --json \
  | tee "$EVIDENCE/02-in-image-provenance.json")"
IN_IMAGE_FP="$(printf '%s' "$IN_IMAGE" | grep -oE '"renderCodeSha256": "[0-9a-f]{64}"' | head -1 | grep -oE '[0-9a-f]{64}')"
[ "$IN_IMAGE_FP" = "$RENDER_CODE_SHA256" ] \
  || die "image contains render code $IN_IMAGE_FP, expected $RENDER_CODE_SHA256"
echo "in-image fingerprint matches: $IN_IMAGE_FP"

# And prove the scene assembly file itself is the one on this commit.
REPO_ASSEMBLE="$(sha256sum scripts/blender/assemble_scene.py | cut -d' ' -f1)"
IMAGE_ASSEMBLE="$(docker run --rm --entrypoint sha256sum "$BUILD_TAG" /opt/ddp-worker/blender/assemble_scene.py | cut -d' ' -f1)"
[ "$REPO_ASSEMBLE" = "$IMAGE_ASSEMBLE" ] || die "baked assemble_scene.py differs from this commit"
echo "baked assemble_scene.py matches: $IMAGE_ASSEMBLE"

step "4b. required worker files, blender version, and architecture"
IMAGE_ARCH="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$BUILD_TAG")"
[ "$IMAGE_ARCH" = "linux/amd64" ] || die "image architecture is $IMAGE_ARCH, expected linux/amd64"
echo "architecture: $IMAGE_ARCH"

for required in \
  /opt/ddp-worker/src/worker.js \
  /opt/ddp-worker/src/single-shot.js \
  /opt/ddp-worker/src/render-core.js \
  /opt/ddp-worker/src/child-env.js \
  /opt/ddp-worker/src/provenance.js \
  /opt/ddp-worker/blender/assemble_scene.py
do
  docker run --rm --entrypoint /bin/sh "$BUILD_TAG" -c "test -f '$required'" \
    || die "missing required path in image: $required"
  echo "present: $required"
done

BLENDER_OUT="$(docker run --rm --entrypoint /usr/local/bin/blender "$BUILD_TAG" --version | tee "$EVIDENCE/02b-blender-version.txt")"
printf '%s\n' "$BLENDER_OUT" | grep -q "Blender $EXPECTED_BLENDER" \
  || die "image Blender version did not report $EXPECTED_BLENDER"
echo "blender reports: $(printf '%s\n' "$BLENDER_OUT" | head -1)"

step "5. push and read the digest back"
set +e
docker push "$BUILD_TAG" >"$EVIDENCE/03-docker-push.txt" 2>&1
PUSH_RC=$?
set -e
cat "$EVIDENCE/03-docker-push.txt"
if [ "$PUSH_RC" -ne 0 ]; then
  if grep -qiE 'denied|unauthorized|forbidden|authentication required|insufficient_scope' "$EVIDENCE/03-docker-push.txt"; then
    echo "GHCR_PACKAGE_WRITE_REFUSED" >&2
    die "GITHUB_TOKEN could not push to $IMAGE_REPO"
  fi
  die "docker push failed"
fi
# Prefer the digest docker push itself prints. `buildx imagetools inspect --format`
# is not reliable across docker versions (some ignore --format and dump the
# whole inspect text, which is not a valid @sha256 pin).
DIGEST="$(grep -oE 'sha256:[0-9a-f]{64}' "$EVIDENCE/03-docker-push.txt" | tail -1 || true)"
if [ -z "$DIGEST" ]; then
  DIGEST="$(docker buildx imagetools inspect "$BUILD_TAG" 2>/dev/null \
    | awk '/^Digest:/{print $2; exit}')"
fi
[[ "$DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "could not determine the published digest (got: ${DIGEST:-empty})"
IMAGE_REF="$IMAGE_REPO@$DIGEST"
echo "published: $IMAGE_REF"

step "6. verify the published labels anonymously, the way preflight will"
IMAGE_REF="$IMAGE_REF" \
EXPECTED_COMMIT="$SOURCE_COMMIT" \
EXPECTED_RENDER_CODE="$RENDER_CODE_SHA256" \
EXPECTED_RENDER_ASSETS="$RENDER_ASSET_SHA256" \
  pnpm cloud:verify-image 2>&1 | tee "$EVIDENCE/04-registry-verification.txt"

step "7. suggested pin constants (not applied by this script)"
cat <<EOF | tee "$EVIDENCE/05-pin.txt"
export const WORKER_IMAGE =
  '$IMAGE_REF'; // pragma: allowlist secret
export const WORKER_IMAGE_SOURCE_COMMIT = '$SOURCE_COMMIT';
export const WORKER_IMAGE_RENDER_CODE_SHA256 =
  '$RENDER_CODE_SHA256';
export const WORKER_IMAGE_RENDER_ASSET_SHA256 =
  '$RENDER_ASSET_SHA256';
EOF

if [ "${PIN_UPDATE:-}" != "apply" ]; then
  echo "PIN UPDATE DEFERRED — inspect the verified digest before changing common.ts"
fi

cat <<EOF | tee "$EVIDENCE/06-summary.txt"
SOURCE_COMMIT=$SOURCE_COMMIT
RENDER_CODE_SHA256=$RENDER_CODE_SHA256
RENDER_ASSET_SHA256=$RENDER_ASSET_SHA256
ASSEMBLE_SCENE_SHA256=$REPO_ASSEMBLE
BLENDER_VERSION=$EXPECTED_BLENDER
IMAGE_TAG=$BUILD_TAG
IMMUTABLE_IMAGE_REF=$IMAGE_REF
IMAGE_DIGEST=$DIGEST
REGISTRY_VERIFICATION=PASS
ARCHITECTURE=$IMAGE_ARCH
LOCAL_IMAGE_VERIFICATION=PASS
EOF

echo
echo "BUILD_OK $IMAGE_REF"
echo "Evidence: $EVIDENCE"
echo "Then run: pnpm cloud:accept1080p:preflight"
