from __future__ import annotations

from typing import Any


def initial_bind_policy() -> dict[str, Any]:
    return {
        "automaticWeightsAreFinal": False,
        "automaticWeightsMayInitializeOnly": True,
        "status": "BLOCKED_REAL_EXECUTION_REQUIRED",
        "reason": "Initial skin bind waits for a WORKING blend and bpy.",
    }
