from __future__ import annotations

from typing import Any

CONTROL_SYSTEMS = (
    ("GLOBAL", ("master", "world", "character_root", "cog", "pelvis")),
    ("TORSO", ("spine", "chest", "upper_chest", "neck", "head", "head_isolate")),
    (
        "LEGS",
        (
            "thigh",
            "shin",
            "ankle",
            "foot",
            "toe",
            "ik",
            "fk",
            "ik_fk_switch",
            "pole",
            "foot_roll",
            "heel",
            "toe_pivot",
            "ball_pivot",
            "knee_direction",
            "limited_stretch",
        ),
    ),
    (
        "ARMS",
        ("clavicle", "upper_arm", "forearm", "wrist", "hand", "ik", "fk", "ik_fk_switch", "pole", "hand_space"),
    ),
    (
        "FACE",
        (
            "eye_aim_master",
            "eye_independent",
            "blink",
            "eyelid_upper",
            "eyelid_lower",
            "jaw",
            "mouth_open",
            "mouth_width",
            "smile",
            "frown",
            "corners",
        ),
    ),
)


def plan_controls() -> list[dict[str, Any]]:
    return [{"id": name, "features": list(features)} for name, features in CONTROL_SYSTEMS]
