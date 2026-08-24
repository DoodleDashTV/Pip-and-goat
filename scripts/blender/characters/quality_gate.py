from __future__ import annotations

from typing import Any


def evaluate_master_gate(
    real_asset_present: bool,
    bpy_available: bool,
    *,
    executed: bool = False,
    failed_stages: list[str] | None = None,
    visual_approval: bool = False,
) -> dict[str, Any]:
    blockers = ["HUMAN_APPROVAL_REQUIRED"]
    if failed_stages:
        blockers.append("PRIOR_STAGE_FAILURE")
        blockers.extend(f"STAGE_FAILED:{name}" for name in failed_stages)
    if not visual_approval:
        blockers.append("VISUAL_APPROVAL_REQUIRED")
    if not real_asset_present:
        blockers.insert(0, "GOAT_REAL_ASSET_EXECUTION_BLOCKED")
    if not bpy_available:
        blockers.insert(1 if not real_asset_present else 0, "BLOCKED_REAL_EXECUTION_REQUIRED")
    if executed and not failed_stages:
        blockers.append("DEFORMATION_GATE_AWAITING_HUMAN_REVIEW")
        blockers.append("RENDER_QA_AWAITING_HUMAN_REVIEW")
    else:
        blockers.append("DEFORMATION_GATE_NOT_PASSED")
        blockers.append("RENDER_QA_NOT_PASSED")
    return {
        "status": "BLOCKED",
        "verdict": "NOT_PRODUCTION_READY",
        "goatProductionReady": False,
        "noFalsePass": True,
        "executed": executed,
        "visualApproval": False,
        "blockers": blockers,
    }
