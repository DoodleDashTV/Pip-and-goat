from __future__ import annotations

from typing import Any

CANDIDATES = (
    "shoulder_pinch",
    "elbow_pinch",
    "wrist_collapse",
    "hip_collapse",
    "knee_collapse",
    "ankle_fold",
    "neck_volume",
    "jaw_open_volume",
    "eyelid_intersection",
    "mouth_corner_tear",
)


def plan_correctives() -> list[dict[str, Any]]:
    return [
        {
            "candidate": name,
            "method": "WEIGHT_FIRST",
            "createOnlyIfWeightsCannotFix": True,
            "status": "BLOCKED_REAL_EXECUTION_REQUIRED",
        }
        for name in CANDIDATES
    ]
