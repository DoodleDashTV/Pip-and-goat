#!/usr/bin/env bash
# Ingest the next Pip model and generate its comparison package.
# Never replaces current Pip, canon, production-library, or theatrical bindings.
set -euo pipefail

if [[ "${1:-}" == "" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
TivvleJoy — ingest the next Pip model

Usage:
  scripts/tivvlejoy/ingest-next-pip.sh /path/to/pip_model[.blend|.glb|.gltf|.fbx|.obj|.zip]

Optional:
  PIP_LICENSE="in-house sculpt" PIP_ORIGIN="Justin upload" \
    scripts/tivvlejoy/ingest-next-pip.sh /path/to/pip_model.glb

What it does:
  1. Copies the file unchanged into the intake inbox
  2. Records filename + SHA-256 + license/source fields
  3. Unpacks ZIP packages safely
  4. Opens the model in Blender 4.2.3 LTS
  5. Writes geometry, scale, orientation, texture, and checklist reports
  6. Renders five-views, shoulder/satchel close-ups, and a turntable
  7. Stops. It does not replace current Pip.

What it will not do:
  overwrite current Pip, write production-library/, bind THEATRICAL,
  merge, retopo, final-rig, or use paid resources
EOF
  exit 0
fi

SOURCE="$1"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export CLOUD_RENDER_ENABLED=false
export ALLOW_PAID_GPU_LAUNCH=false
export LIBGL_ALWAYS_SOFTWARE="${LIBGL_ALWAYS_SOFTWARE:-1}"
export GALLIUM_DRIVER="${GALLIUM_DRIVER:-llvmpipe}"

exec python3 "$ROOT/scripts/assets/pip_replacement_intake.py" ingest "$SOURCE" \
  --license "${PIP_LICENSE:-UNKNOWN_PENDING}" \
  --origin "${PIP_ORIGIN:-UNKNOWN_PENDING}" \
  --notes "${PIP_NOTES:-}"
