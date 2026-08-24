from __future__ import annotations

from typing import Any

VALIDATION_CLIPS = (
    "neutral_idle",
    "blink_look_around",
    "head_turns",
    "smile_frown_emotion_transitions",
    "phoneme_viseme_sweep",
    "talking_performance",
    "walk_cycle",
    "run_cycle",
    "jump",
    "landing",
    "crouch",
    "reach",
    "grab_hold_pose",
    "wave",
    "point",
    "excited_reaction",
    "surprised_reaction",
    "sad_reaction",
    "laugh",
    "extreme_full_body_deformation",
)

DEFORMATION_POSES = (
    "neutral",
    "arms_up",
    "arms_forward",
    "arms_crossed",
    "elbows_max_flex",
    "wrist_extremes",
    "hip_flex",
    "knee_flex",
    "deep_crouch",
    "wide_stance",
    "one_leg_balance",
    "head_left",
    "head_right",
    "head_up",
    "head_down",
    "jaw_open",
    "blink",
    "smile",
    "frown",
    "combined_speaking_emotion",
)


def plan_animation_suite() -> dict[str, Any]:
    return {
        "clips": list(VALIDATION_CLIPS),
        "deformationPoses": list(DEFORMATION_POSES),
        "finalEpisodeAnimation": False,
        "framing": {"width": 1080, "height": 1920, "fps": 30},
        "status": "BLOCKED_REAL_EXECUTION_REQUIRED",
    }
