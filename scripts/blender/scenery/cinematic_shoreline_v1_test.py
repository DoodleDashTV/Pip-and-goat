#!/usr/bin/env python3
from cinematic_riverbank_v1 import WATER_Z, riverbank_sample
from cinematic_shoreline_v1 import (
    TRANSITION_WIDTH,
    active_bands,
    along_shore,
    cue_slots,
    point_on_south_shore,
    transition_color,
    transition_width_ok,
)
from cinematic_riverbank_v1 import point_on_south_shore


def test_transition_has_real_width_and_overlap():
    assert TRANSITION_WIDTH >= 1.6
    alongs = [-0.4, 0.0, 0.3, 0.9, 1.5]
    bands = [active_bands(a) for a in alongs]
    assert any(len(b) >= 2 for b in bands)
    assert "fine_gravel" in active_bands(0.2)
    assert "wet_soil" in active_bands(0.3)


def test_color_does_not_step_at_waterline():
    x, y = point_on_south_shore(-2.2, offset=0.0)
    land = point_on_south_shore(-2.2, offset=0.35)
    wet = point_on_south_shore(-2.2, offset=-0.25)
    c0 = transition_color(x, y)
    c1 = transition_color(*land)
    c2 = transition_color(*wet)
    # Adjacent colours stay close. No brown/green isoline.
    assert sum(abs(c0[i] - c1[i]) for i in range(3)) < 0.12
    assert sum(abs(c0[i] - c2[i]) for i in range(3)) < 0.14


def test_cues_sit_on_real_waterline():
    slots = cue_slots()
    assert len(slots) >= 8
    z, _ = riverbank_sample(slots[0][0], slots[0][1])
    assert abs(z - WATER_Z) < 0.55
    samples = [(s[0], s[1]) for s in slots]
    assert transition_width_ok(samples)


if __name__ == "__main__":
    test_transition_has_real_width_and_overlap()
    test_color_does_not_step_at_waterline()
    test_cues_sit_on_real_waterline()
    print("cinematic_shoreline_v1_test PASS")
