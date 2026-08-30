#!/usr/bin/env python3
from cinematic_water_lock_v1 import WATER_LOCK, WATER_TESTS, assert_lock, test_cfg


def test_lock_is_physical_d():
    assert WATER_LOCK["ior"] == 1.33
    assert WATER_LOCK["transmission"] == 0.80
    assert WATER_LOCK["metallic"] == 0.0
    assert WATER_LOCK["specular"] == 0.50
    assert WATER_LOCK["prismM"] == 0.18
    assert WATER_LOCK["volumeDensity"] == 0.18


def test_abc_preserve_lock():
    for name in ("A", "B", "C"):
        cfg = test_cfg(name)
        assert_lock(cfg)
        assert cfg["name"].startswith("WATER_TEST_")
    assert WATER_TESTS["A"]["bedAlbedo"][0] > WATER_TESTS["B"]["bedAlbedo"][0]
    assert WATER_TESTS["B"]["treeFoil"] is True
    assert WATER_TESTS["C"]["treeFoil"] is True


if __name__ == "__main__":
    test_lock_is_physical_d()
    test_abc_preserve_lock()
    print("cinematic_water_lock_v1_test PASS")
