#!/usr/bin/env python3
from cinematic_style_unifier_v2 import SPEC


def test_v2_keeps_stylized_not_photoreal():
    assert SPEC["system"] == "TJ_ENVIRONMENT_STYLE_UNIFIER_V2"
    assert SPEC["doNotFlattenMaps"] is True
    assert SPEC["doNotMakeLouisPhotoreal"] is True
    assert SPEC["doNotRestyleShot05Peak"] is True
    assert 0.70 <= SPEC["botaniqSaturation"] <= 0.88
    assert SPEC["botaniqNormalScale"] < 1.0
    assert SPEC["rockRoughness"] >= 0.60


if __name__ == "__main__":
    test_v2_keeps_stylized_not_photoreal()
    print("cinematic_style_unifier_v2_test PASS")
