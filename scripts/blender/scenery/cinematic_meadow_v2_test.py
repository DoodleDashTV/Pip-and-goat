#!/usr/bin/env python3
from cinematic_meadow_v2 import community_weights, foundation_weight, meadow_v2_payload, meadow_v2_plan


def test_foundation_is_a_field_not_dots():
    plan = meadow_v2_plan((-7.0, 5.0, -17.0, -8.0))
    foundation = [item for item in plan if item["role"] == "foundation"]
    assert len(foundation) > 40
    payload = meadow_v2_payload(plan)
    assert payload["foundationPresent"] is True
    assert payload["system"] == "TJ_MEADOW_SYSTEM_V2"


def test_communities_overlap():
    w = community_weights(-3.8, -9.5)
    assert w["foundation"] > 0.2 or w["medium"] > 0.2
    worn = foundation_weight(-6.2, -4.0)
    assert worn < 0.4


if __name__ == "__main__":
    test_foundation_is_a_field_not_dots()
    test_communities_overlap()
    print("cinematic_meadow_v2_test PASS")
