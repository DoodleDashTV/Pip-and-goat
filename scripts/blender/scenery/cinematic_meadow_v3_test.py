#!/usr/bin/env python3
from cinematic_meadow_v3 import field_weights, meadow_v3_payload, meadow_v3_plan


def test_foundation_dominates_the_wedge():
    plan = meadow_v3_plan((-6.5, 4.5, -17.5, -8.0))
    foundation = [item for item in plan if item["role"] == "foundation"]
    assert len(foundation) >= 60
    payload = meadow_v3_payload(plan)
    assert payload["system"] == "TJ_MEADOW_SYSTEM_V3"
    assert payload["foundationPresent"] is True
    assert payload["usesInstances"] is True


def test_fields_overlap_and_have_negative_space():
    w = field_weights(-3.6, -10.2)
    assert w["foundation"] > 0.2 or w["medium"] > 0.2
    worn = field_weights(-6.2, -4.0)
    assert worn["worn"] == 1.0 or worn["foundation"] < 0.2


if __name__ == "__main__":
    test_foundation_dominates_the_wedge()
    test_fields_overlap_and_have_negative_space()
    print("cinematic_meadow_v3_test PASS")
