"""Action-specific F-curve polish profiles and free, local audit helpers.

The profile contract is intentionally usable without importing ``bpy`` so CI can
test it. ``apply_profile_to_fcurve`` accepts Blender FCurves by duck typing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping, Sequence


@dataclass(frozen=True)
class MotionProfile:
    profile_id: str
    interpolation: str
    easing: str
    handle_type: str | None
    squash_stretch_limit: float
    overshoot_limit: float
    purpose: str


MOTION_PROFILES: Mapping[str, MotionProfile] = {
    "BLOCKING": MotionProfile(
        "BLOCKING", "CONSTANT", "AUTO", None, 0.0, 0.0,
        "Stepped storytelling, contacts, silhouettes, and timing intent.",
    ),
    "ORGANIC_SUBTLE": MotionProfile(
        "ORGANIC_SUBTLE", "BEZIER", "EASE_IN_OUT", "AUTO_CLAMPED", 0.03, 0.04,
        "Breathing, gaze-supported head motion, and restrained acting.",
    ),
    "ORGANIC_ACTION": MotionProfile(
        "ORGANIC_ACTION", "BEZIER", "EASE_IN_OUT", "AUTO_CLAMPED", 0.08, 0.10,
        "Gestures and locomotion with readable acceleration and settle.",
    ),
    "STYLIZED_IMPACT": MotionProfile(
        "STYLIZED_IMPACT", "BEZIER", "EASE_OUT", "AUTO_CLAMPED", 0.15, 0.16,
        "Reviewed landings, rebounds, and comedy impacts inside the rig envelope.",
    ),
    "MECHANICAL_LINEAR": MotionProfile(
        "MECHANICAL_LINEAR", "LINEAR", "AUTO", None, 0.0, 0.0,
        "Intentional technical or mechanical motion only.",
    ),
    "TECHNICAL_STEP": MotionProfile(
        "TECHNICAL_STEP", "CONSTANT", "AUTO", None, 0.0, 0.0,
        "Visibility, constraint, and discrete state switches.",
    ),
}


@dataclass(frozen=True)
class CameraComfortProfile:
    profile_id: str
    max_translation_mps: float
    max_pan_degrees_per_second: float
    max_roll_degrees: float
    shake_allowed: bool


CAMERA_COMFORT_PROFILES: Mapping[str, CameraComfortProfile] = {
    "GENTLE_REVEAL": CameraComfortProfile("GENTLE_REVEAL", 0.40, 8.0, 0.5, False),
    "CHARACTER_TRACK": CameraComfortProfile("CHARACTER_TRACK", 0.55, 12.0, 0.5, False),
    "REVIEWED_IMPACT": CameraComfortProfile("REVIEWED_IMPACT", 0.30, 10.0, 0.75, True),
    "LOCKED": CameraComfortProfile("LOCKED", 0.0, 0.0, 0.5, False),
}


def get_motion_profile(profile_id: str) -> MotionProfile:
    try:
        return MOTION_PROFILES[profile_id]
    except KeyError as exc:
        raise ValueError(f"Unknown TivvleJoy motion profile: {profile_id}") from exc


def apply_profile_to_fcurve(fcurve: object, profile_id: str) -> int:
    """Apply one approved profile to every key on a Blender-like FCurve."""
    profile = get_motion_profile(profile_id)
    points = getattr(fcurve, "keyframe_points", None)
    if points is None:
        raise TypeError("Expected an FCurve-like object with keyframe_points")
    count = 0
    for point in points:
        point.interpolation = profile.interpolation
        if hasattr(point, "easing"):
            point.easing = profile.easing
        if profile.handle_type is not None:
            if hasattr(point, "handle_left_type"):
                point.handle_left_type = profile.handle_type
            if hasattr(point, "handle_right_type"):
                point.handle_right_type = profile.handle_type
        count += 1
    return count


def audit_keyframes(
    frames: Sequence[float],
    interpolations: Sequence[str],
    *,
    intended_profile: str,
    squash_stretch_samples: Iterable[float] = (),
) -> list[dict[str, object]]:
    """Return measurable defects; an empty result is a technical pass, not art approval."""
    profile = get_motion_profile(intended_profile)
    findings: list[dict[str, object]] = []
    if len(frames) != len(interpolations):
        findings.append({"code": "KEY_DATA_LENGTH_MISMATCH", "severity": "FAIL"})
        return findings
    if any(right <= left for left, right in zip(frames, frames[1:])):
        findings.append({"code": "NON_MONOTONIC_OR_DUPLICATE_KEY", "severity": "FAIL"})
    mismatches = [index for index, value in enumerate(interpolations) if value != profile.interpolation]
    if mismatches:
        findings.append({
            "code": "INTERPOLATION_PROFILE_MISMATCH",
            "severity": "FAIL",
            "expected": profile.interpolation,
            "keyIndexes": mismatches,
        })
    samples = [abs(float(value)) for value in squash_stretch_samples]
    observed = max(samples, default=0.0)
    if observed > profile.squash_stretch_limit + 1e-9:
        findings.append({
            "code": "SQUASH_STRETCH_OUTSIDE_PROFILE",
            "severity": "FAIL",
            "observed": observed,
            "limit": profile.squash_stretch_limit,
        })
    return findings


def audit_camera_motion(
    *,
    profile_id: str,
    translation_mps: float,
    pan_degrees_per_second: float,
    roll_degrees: float,
    has_shake: bool,
) -> list[dict[str, object]]:
    profile = CAMERA_COMFORT_PROFILES.get(profile_id)
    if profile is None:
        raise ValueError(f"Unknown TivvleJoy camera comfort profile: {profile_id}")
    findings: list[dict[str, object]] = []
    checks = (
        ("CAMERA_TRANSLATION_TOO_FAST", abs(translation_mps), profile.max_translation_mps),
        ("CAMERA_PAN_TOO_FAST", abs(pan_degrees_per_second), profile.max_pan_degrees_per_second),
        ("CAMERA_ROLL_OUT_OF_RANGE", abs(roll_degrees), profile.max_roll_degrees),
    )
    for code, observed, limit in checks:
        if observed > limit + 1e-9:
            findings.append({"code": code, "severity": "FAIL", "observed": observed, "limit": limit})
    if has_shake and not profile.shake_allowed:
        findings.append({"code": "UNMOTIVATED_CAMERA_SHAKE", "severity": "FAIL"})
    return findings

