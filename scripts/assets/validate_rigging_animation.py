"""
Fail-closed local validation for Pip/Goat rigging + animation.

Gates (camera motion never counts):
  RIG_BINDING_VALID
  PIP_MOTION_VALID
  GOAT_MOTION_VALID
  ANIMATION_CHANNELS_VALID

Sample frames: 1, 10, 20, 30 (equivalent mid-clip set for 30-frame actions;
legacy 1/30/60/90 collapses cyclic clips to rest/hold).
"""

from __future__ import annotations

import json
import os
import runpy
from pathlib import Path

ROOT = Path(os.environ.get("REPO_ROOT", "/tmp/ddp-rigging-repair"))
AUDIT = ROOT / "artifacts/performance/rigging-audit/rigging-animation-audit.json"
OUT = ROOT / "artifacts/performance/rigging-audit/validation.json"


def main():
    # Reuse the evidence auditor (writes AUDIT).
    audit_path = ROOT / "scripts/assets/audit_rigging_animation.py"
    runpy.run_path(str(audit_path), run_name="__main__")
    report = json.loads(AUDIT.read_text())
    checks = report.get("summaryChecks") or {}
    required = [
        "RIG_BINDING_VALID",
        "PIP_MOTION_VALID",
        "GOAT_MOTION_VALID",
        "ANIMATION_CHANNELS_VALID",
    ]
    missing = [k for k in required if k not in checks]
    failed = [k for k in required if checks.get(k) is not True]
    # Camera-motion exclusion contract
    if report.get("cameraMotionCountedAsCharacterMotion") is not False:
        failed.append("CAMERA_MOTION_EXCLUSION")

    # Production library copies must also pass (used by assemble path).
    for role in ("pip", "goat"):
        prod = (report.get("productionLibrary") or {}).get(role) or {}
        prod_checks = prod.get("checks") or {}
        if not prod_checks.get("RIG_BINDING_VALID"):
            failed.append(f"PROD_{role.upper()}_RIG_BINDING_VALID")
        motion_key = "PIP_MOTION_VALID" if role == "pip" else "GOAT_MOTION_VALID"
        if not prod_checks.get(motion_key):
            failed.append(f"PROD_{motion_key}")

    status = "PASS" if not missing and not failed else "FAIL"
    result = {
        "status": status,
        "checks": checks,
        "missing": missing,
        "failed": failed,
        "sampleFrames": report.get("sampleFrames"),
        "cameraMotionCountedAsCharacterMotion": report.get("cameraMotionCountedAsCharacterMotion"),
        "audit": str(AUDIT),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2) + "\n")
    print("RIGGING_VALIDATION " + json.dumps(result))
    if status != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
