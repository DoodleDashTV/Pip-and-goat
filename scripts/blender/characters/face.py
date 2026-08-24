from __future__ import annotations

from typing import Any

FACE_CONTROLS = (
    "eye_aim_master",
    "eye_left",
    "eye_right",
    "blink",
    "eyelid_upper",
    "eyelid_lower",
    "jaw",
    "mouth_open",
    "mouth_width",
    "smile",
    "frown",
    "corners",
)

EXPRESSIONS = (
    "happy",
    "excited",
    "curious",
    "surprised",
    "worried",
    "confused",
    "sad",
    "determined",
    "mischievous",
    "laughing",
)


def plan_face() -> dict[str, Any]:
    return {
        "controls": list(FACE_CONTROLS),
        "expressions": list(EXPRESSIONS),
        "methods": ["BONE", "SHAPE_KEY", "DRIVER", "MIX"],
        "squashStretchOnlyIfItPreservesIdentity": True,
        "status": "BLOCKED_REAL_EXECUTION_REQUIRED",
    }
