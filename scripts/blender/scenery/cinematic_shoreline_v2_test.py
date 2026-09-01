#!/usr/bin/env python3
from cinematic_shoreline_v2 import (
    EVENT_KINDS,
    TRANSITION_WIDTH_MAX,
    TRANSITION_WIDTH_MIN,
    local_width,
    occupation_ok,
    physical_slots,
    shoreline_v2_payload,
)


def test_events_are_five_plus_and_irregular():
    assert "grass_overhang" in EVENT_KINDS
    assert "soil_bay" in EVENT_KINDS
    assert "gravel_tongue" in EVENT_KINDS
    assert "submerged_rocks" in EVENT_KINDS
    assert "fern_intrusion" in EVENT_KINDS
    widths = [local_width(x) for x in (-6.6, -4.1, -1.9, 0.55, 2.7)]
    assert min(widths) >= TRANSITION_WIDTH_MIN - 0.05
    assert max(widths) <= TRANSITION_WIDTH_MAX + 0.15
    assert max(widths) - min(widths) > 0.35


def test_physical_slots_occupy_the_waterline():
    slots = physical_slots()
    assert occupation_ok(slots)
    cues = {s[2] for s in slots}
    assert "grass_root" in cues
    assert "fine_gravel" in cues
    assert "submerged_stone" in cues or "medium_stone" in cues
    payload = shoreline_v2_payload()
    assert payload["system"] == "TJ_SHORELINE_TRANSITION_V2"
    assert payload["notParallelBands"] is True


if __name__ == "__main__":
    test_events_are_five_plus_and_irregular()
    test_physical_slots_occupy_the_waterline()
    print("cinematic_shoreline_v2_test PASS")
