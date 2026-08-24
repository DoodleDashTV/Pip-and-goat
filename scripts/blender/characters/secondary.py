from __future__ import annotations

from typing import Any


def plan_secondary() -> dict[str, Any]:
    return {
        "controls": ["ears", "horns", "collar", "round_tag", "scarf", "fur"],
        "simulationMandatory": False,
        "preferDeterministicControls": True,
        "status": "BLOCKED_REAL_EXECUTION_REQUIRED",
    }
