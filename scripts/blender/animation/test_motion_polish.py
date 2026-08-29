from __future__ import annotations

import unittest

from motion_polish import (
    apply_profile_to_fcurve,
    audit_camera_motion,
    audit_keyframes,
    get_motion_profile,
)


class _Point:
    interpolation = "LINEAR"
    easing = "AUTO"
    handle_left_type = "AUTO"
    handle_right_type = "AUTO"


class _Curve:
    def __init__(self, count: int):
        self.keyframe_points = [_Point() for _ in range(count)]


class MotionPolishTests(unittest.TestCase):
    def test_profiles_are_action_specific(self):
        self.assertEqual(get_motion_profile("ORGANIC_SUBTLE").squash_stretch_limit, 0.03)
        self.assertEqual(get_motion_profile("STYLIZED_IMPACT").squash_stretch_limit, 0.15)
        self.assertEqual(get_motion_profile("MECHANICAL_LINEAR").interpolation, "LINEAR")

    def test_applies_bezier_profile(self):
        curve = _Curve(3)
        self.assertEqual(apply_profile_to_fcurve(curve, "ORGANIC_ACTION"), 3)
        self.assertTrue(all(point.interpolation == "BEZIER" for point in curve.keyframe_points))
        self.assertTrue(all(point.handle_left_type == "AUTO_CLAMPED" for point in curve.keyframe_points))

    def test_audit_fails_accidental_linear_and_excessive_deformation(self):
        findings = audit_keyframes(
            [1, 8, 16], ["BEZIER", "LINEAR", "BEZIER"],
            intended_profile="ORGANIC_ACTION", squash_stretch_samples=[0.02, 0.11],
        )
        self.assertEqual(
            [finding["code"] for finding in findings],
            ["INTERPOLATION_PROFILE_MISMATCH", "SQUASH_STRETCH_OUTSIDE_PROFILE"],
        )

    def test_camera_comfort_is_measurable(self):
        self.assertEqual(
            audit_camera_motion(
                profile_id="CHARACTER_TRACK", translation_mps=0.4,
                pan_degrees_per_second=8, roll_degrees=0.2, has_shake=False,
            ),
            [],
        )
        findings = audit_camera_motion(
            profile_id="GENTLE_REVEAL", translation_mps=0.8,
            pan_degrees_per_second=8, roll_degrees=0.2, has_shake=True,
        )
        self.assertEqual(
            [finding["code"] for finding in findings],
            ["CAMERA_TRANSLATION_TOO_FAST", "UNMOTIVATED_CAMERA_SHAKE"],
        )


if __name__ == "__main__":
    unittest.main()

