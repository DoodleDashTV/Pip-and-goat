#!/usr/bin/env bash
# Protected production conversion of the official backpack Pip.
# Does not overwrite the approved source or working blend, replace
# production-library, bind theatrically, merge, remesh, or use paid resources.
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
TivvleJoy — convert the approved backpack Pip

Usage:
  scripts/tivvlejoy/convert-approved-pip.sh

What it does:
  1. Copies the official working blend into a protected conversion path
  2. Audits topology, materials, textures, UVs, normals, scale, orientation
  3. Separates only high-confidence disconnected accessory islands
  4. Adds a validation-only armature
  5. Renders rest and deformation-test views
  6. Compares those views to the approved identity stills
  7. Stops for Justin

What it will not do:
  overwrite the official working blend or approved source,
  write production-library/, bind THEATRICAL, merge Draft PR #24,
  voxel-remesh, primitive-rebuild, touch Goat, or use paid resources
EOF
  exit 0
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export CLOUD_RENDER_ENABLED=false
export ALLOW_PAID_GPU_LAUNCH=false
export LIBGL_ALWAYS_SOFTWARE="${LIBGL_ALWAYS_SOFTWARE:-1}"
export GALLIUM_DRIVER="${GALLIUM_DRIVER:-llvmpipe}"

exec python3 "$ROOT/scripts/assets/pip_production_conversion.py" convert
