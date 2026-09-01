#!/usr/bin/env python3
from cinematic_creek_bed_v2 import ZONE_DEPTH, bed_slots, creek_bed_v2_payload, zone_at
from cinematic_water_lock_v1 import WATER_LOCK, assert_lock


def test_three_reveal_zones_and_mixed_stone():
    assert zone_at(-5.5) == "A"
    assert zone_at(-2.0) == "B"
    assert zone_at(2.0) == "C"
    assert ZONE_DEPTH["A"] < ZONE_DEPTH["B"] < ZONE_DEPTH["C"]
    payload = creek_bed_v2_payload()
    assert payload["zonesPresent"] == ["A", "B", "C"]
    assert payload["notUniform"] is True
    assert "fine_gravel" in payload["classesPresent"]
    assert "medium" in payload["classesPresent"]
    assert_lock(payload["waterLock"])
    assert payload["waterLock"] == WATER_LOCK
    assert len(bed_slots()) >= 16


if __name__ == "__main__":
    test_three_reveal_zones_and_mixed_stone()
    print("cinematic_creek_bed_v2_test PASS")
