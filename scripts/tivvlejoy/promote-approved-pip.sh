#!/usr/bin/env bash
# Promote the Justin-approved backpack Pip to the working visual foundation.
# Does not replace production-library, bind theatrically, merge, or claim
# the fused mesh is production-ready.
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
TivvleJoy — promote the approved backpack Pip

Usage:
  scripts/tivvlejoy/promote-approved-pip.sh /tmp/pip_backpack_replacement.glb

What it does:
  1. Verifies the approved SHA-256
  2. Archives and fingerprints the source
  3. Writes visual-identity catalogs
  4. Builds a protected working copy with object-level scale only
  5. Inspects intersections without destructive cleanup
  6. Renders front / back / left / right / three-quarter verification views
  7. Stops for Justin

What it will not do:
  overwrite the superseded high-res Pip, write production-library/,
  bind THEATRICAL, merge Draft PR #24, remesh, or use paid resources
EOF
  exit 0
fi

SOURCE="${1:-/tmp/pip_backpack_replacement.glb}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export CLOUD_RENDER_ENABLED=false
export ALLOW_PAID_GPU_LAUNCH=false
export LIBGL_ALWAYS_SOFTWARE="${LIBGL_ALWAYS_SOFTWARE:-1}"
export GALLIUM_DRIVER="${GALLIUM_DRIVER:-llvmpipe}"

exec python3 "$ROOT/scripts/assets/pip_visual_foundation.py" promote "$SOURCE"
