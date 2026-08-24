from __future__ import annotations

from typing import Any


def plan_render_qa() -> dict[str, Any]:
    return {
        "turntable": True,
        "poseSheet": True,
        "resolution": {"width": 1080, "height": 1920, "fps": 30},
        "status": "BLOCKED_REAL_EXECUTION_REQUIRED",
        "reason": "Render QA requires authorized offline Blender execution of the WORKING copy.",
    }
