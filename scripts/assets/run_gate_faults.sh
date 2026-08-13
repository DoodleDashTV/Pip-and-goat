#!/usr/bin/env bash
# Prove every local quality gate fails closed on the defect it guards against.
#
# For each injected fault, scene_gates.py exits 0 only when the gate it expects
# actually flipped to false. A gate that cannot fail is not a gate.
#
# Local only: no Runpod, no GPU, no billing.
set -uo pipefail

cd "$(dirname "$0")/../.."

FAULTS=(camera-only keep-imported-lights map-detach map-sunk quaternion-bones unbind-skin)
OUT_DIR="artifacts/local-acceptance"
mkdir -p "$OUT_DIR"

failures=0
for fault in "${FAULTS[@]}"; do
  line=$(blender -b -noaudio --python scripts/assets/scene_gates.py -- \
    --out "$OUT_DIR/gates_fault_${fault}.json" --fault "$fault" 2>&1 |
    grep -o 'DDP_SCENE_GATES:.*' || true)
  status=${PIPESTATUS[0]}
  if [ "$status" -eq 0 ]; then
    echo "PASS  fault=${fault} correctly tripped its gate"
  else
    echo "FAIL  fault=${fault} did NOT trip its gate (exit ${status})"
    echo "      ${line}"
    failures=$((failures + 1))
  fi
done

echo "DDP_GATE_FAULTS:{\"faults\": ${#FAULTS[@]}, \"failures\": ${failures}}"
[ "$failures" -eq 0 ]
