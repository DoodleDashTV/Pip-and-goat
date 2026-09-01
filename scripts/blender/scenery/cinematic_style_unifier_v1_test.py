#!/usr/bin/env python3
from cinematic_style_unifier_v1 import SPEC, material_is_botaniq


class _Mat:
    def __init__(self, name, images=()):
        self.name = name
        self.node_tree = type("T", (), {"nodes": [_Img(n) for n in images]})()


class _Img:
    def __init__(self, name):
        self.image = type("I", (), {"name": name, "filepath": name})()


def test_spec_does_not_flatten_or_photoreal_louis():
    assert SPEC["system"] == "TJ_ENVIRONMENT_STYLE_UNIFIER_V1"
    assert SPEC["doNotFlattenMaps"] is True
    assert SPEC["doNotMakeLouisPhotoreal"] is True
    assert 0.70 <= SPEC["botaniqSaturation"] <= 0.90
    assert SPEC["botaniqNormalScale"] < 1.0


def test_detects_botaniq_by_image_not_just_prefix():
    assert material_is_botaniq(_Mat("Leaf.001", ["bq_Leaf_Fagus_Diffuse.png"])) is True
    assert material_is_botaniq(_Mat("Default", ["wood.jpg"])) is False
    assert material_is_botaniq(_Mat("bq_Bark_01")) is True


if __name__ == "__main__":
    test_spec_does_not_flatten_or_photoreal_louis()
    test_detects_botaniq_by_image_not_just_prefix()
    print("cinematic_style_unifier_v1_test PASS")
