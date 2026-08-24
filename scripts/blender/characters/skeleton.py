from __future__ import annotations

from typing import Any

GENERIC_SKELETON = (
    ("CTRL.MASTER", "MASTER", False, True),
    ("CTRL.WORLD", "WORLD_ROOT", False, True),
    ("CTRL.ROOT", "CHARACTER_ROOT", False, True),
    ("CTRL.COG", "COG", False, True),
    ("DEF.PELVIS", "PELVIS", True, True),
    ("DEF.SPINE_01", "SPINE", True, True),
    ("DEF.SPINE_02", "SPINE", True, True),
    ("DEF.CHEST", "CHEST", True, True),
    ("DEF.UPPER_CHEST", "UPPER_CHEST", True, False),
    ("DEF.NECK", "NECK", True, True),
    ("DEF.HEAD", "HEAD", True, True),
    ("CTRL.HEAD_ISOLATE", "HEAD_ISOLATE", False, True),
    ("DEF.JAW", "JAW", True, True),
    ("DEF.EYE.L", "EYE", True, True),
    ("DEF.EYE.R", "EYE", True, True),
    ("DEF.THIGH.L", "THIGH", True, True),
    ("DEF.THIGH.R", "THIGH", True, True),
    ("DEF.SHIN.L", "SHIN", True, True),
    ("DEF.SHIN.R", "SHIN", True, True),
    ("DEF.ANKLE.L", "ANKLE", True, True),
    ("DEF.ANKLE.R", "ANKLE", True, True),
    ("DEF.FOOT.L", "FOOT", True, True),
    ("DEF.FOOT.R", "FOOT", True, True),
    ("CTRL.IK.FOOT.L", "IK_TARGET", False, True),
    ("CTRL.IK.FOOT.R", "IK_TARGET", False, True),
    ("CTRL.POLE.KNEE.L", "POLE", False, True),
    ("CTRL.POLE.KNEE.R", "POLE", False, True),
)


def plan_skeleton() -> list[dict[str, Any]]:
    return [
        {"controlId": name, "role": role, "deform": deform, "required": required}
        for name, role, deform, required in GENERIC_SKELETON
    ]
