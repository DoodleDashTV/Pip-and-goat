#!/usr/bin/env python3
"""Pure tests for TJ_RIVERBANK_GENERATOR_V1."""
from __future__ import annotations

from cinematic_hero_v3_land import channel_profile
from cinematic_riverbank_v1 import (
    BIOME_ORDER,
    HERO_BANK_EVENTS,
    WATER_Z,
    RiverbankControls,
    controls_payload,
    hero_event,
    riverbank_sample,
    shoreline_distance,
    worn_path,
)


def test_channel_still_exists():
    dist, _ = channel_profile(-2.0, -12.2)
    assert dist < 0.35


def test_biome_progresses_from_bed_to_meadow():
    bed = riverbank_sample(-2.0, -12.2)
    wet = riverbank_sample(-2.15, -14.05)
    soil = riverbank_sample(-2.4, -16.2)
    meadow = riverbank_sample(-2.6, -19.4)
    assert bed[1] in {"bed", "underwater"}
    assert wet[1] in {"wet_shelf", "gravel", "underwater", "damp"}
    assert soil[1] in {"dry_soil", "eroded", "damp", "root_grass", "gravel"}
    assert meadow[1] in {"meadow", "root_grass"}
    assert bed[0] < wet[0] <= soil[0] <= meadow[0] + 0.08
    assert bed[0] < WATER_Z < meadow[0]


def test_shoreline_is_terrain_water_intersection():
    x = -3.6
    emerge = shoreline_distance(x, south=True)
    dist, signed = channel_profile(x, -12.2)
    # Walk south from the polyline until we hit emerge.
    y = -12.2
    while channel_profile(x, y)[0] < emerge and y > -20.0:
        y -= 0.05
    z, _biome = riverbank_sample(x, y)
    assert abs(z - WATER_Z) < 0.12
    assert signed < 0.0 or dist < 2.0


def test_no_landward_cavity():
    for x in (-8.0, -5.0, -2.0, 1.0, 4.0):
        emerge = shoreline_distance(x, south=True)
        for step in range(8):
            y = -12.4 - 0.8 * step
            dist, signed = channel_profile(x, y)
            if signed >= 0 or dist < emerge:
                continue
            z, _ = riverbank_sample(x, y)
            assert z >= WATER_Z + 0.015, (x, y, z, dist, emerge)


def test_macro_events_are_few_and_irregular():
    kinds = [item[2] for item in HERO_BANK_EVENTS]
    assert 4 <= len(HERO_BANK_EVENTS) <= 7
    assert len(set(kinds)) == len(kinds)
    xs = [item[0] for item in HERO_BANK_EVENTS]
    gaps = [xs[i + 1] - xs[i] for i in range(len(xs) - 1)]
    assert max(gaps) - min(gaps) > 0.35
    assert hero_event(-7.85)["kind"] == "soil_bay"
    assert hero_event(-5.05)["kind"] == "rock_projection"


def test_no_high_frequency_lumps():
    a = riverbank_sample(-4.0, -19.0)[0]
    b = riverbank_sample(-3.6, -18.8)[0]
    assert abs(a - b) < 0.14


def test_controls_change_width_and_depth():
    wide = RiverbankControls(channel_width=2.10, channel_depth=0.55)
    narrow = RiverbankControls(channel_width=1.20, channel_depth=0.22)
    assert shoreline_distance(-2.0, wide) > shoreline_distance(-2.0, narrow)
    deep = riverbank_sample(-2.0, -12.2, wide)[0]
    shallow = riverbank_sample(-2.0, -12.2, narrow)[0]
    assert deep < shallow


def test_payload_and_worn_path():
    payload = controls_payload()
    assert payload["shoreline"] == "terrain_intersect_water"
    assert payload["eventCount"] == 7
    assert "meadow" in BIOME_ORDER
    assert worn_path(-6.2, -4.0) or worn_path(-6.0, -3.4)


if __name__ == "__main__":
    test_channel_still_exists()
    test_biome_progresses_from_bed_to_meadow()
    test_shoreline_is_terrain_water_intersection()
    test_no_landward_cavity()
    test_macro_events_are_few_and_irregular()
    test_no_high_frequency_lumps()
    test_controls_change_width_and_depth()
    test_payload_and_worn_path()
    print("cinematic_riverbank_v1_test PASS")
