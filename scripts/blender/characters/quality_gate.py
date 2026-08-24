from __future__ import annotations

from typing import Any


def evaluate_master_gate(real_asset_present: bool, bpy_available: bool) -> dict[str, Any]:
    blockers = ["HUMAN_APPROVAL_REQUIRED", "DEFORMATION_GATE_NOT_PASSED", "RENDER_QA_NOT_PASSED"]
    if not real_asset_present:
        blockers.insert(0, "GOAT_REAL_ASSET_EXECUTION_BLOCKED")
    if not bpy_available:
        blockers.insert(1 if not real_asset_present else 0, "BLOCKED_REAL_EXECUTION_REQUIRED")
    return {
        "status": "BLOCKED",
        "verdict": "NOT_PRODUCTION_READY",
        "goatProductionReady": False,
        "noFalsePass": True,
        "blockers": blockers,
    }
