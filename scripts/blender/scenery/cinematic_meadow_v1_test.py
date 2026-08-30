#!/usr/bin/env python3
"""Pure tests for TJ_MEADOW_SYSTEM_V1."""
from __future__ import annotations

from cinematic_meadow_v1 import (
    GEOSCATTER_PRESETS,
    ZONES,
    meadow_payload,
    meadow_scatter_plan,
    meadow_zone,
    scatter_density,
)


def test_zones_are_physical_and_varied():
    samples = {
        meadow_zone(x, y)
        for x, y in (
            (-2.5, -19.5),
            (-15.0, -8.5),
            (-6.2, -3.8),
            (4.6, -6.8),
            (-9.8, -8.0),
            (0.0, -16.5),
            (-6.0, -2.5),
        )
    }
    assert len(samples) >= 4
    assert samples <= set(ZONES)


def test_negative_space_exists():
    plan = meadow_scatter_plan((-14.0, 9.0, -22.0, 4.0), 1.35)
    payload = meadow_payload(plan)
    assert payload["negativeSpace"] is True
    assert any(item["zone"] in {"bare_earth", "worn_open", "rocky_sparse"} for item in plan)
    assert payload["geoscatterAddonEnabled"] is False
    assert "Meadows/grass_biome_01" in GEOSCATTER_PRESETS


def test_density_falls_with_distance_but_not_to_a_plane():
    near = scatter_density("medium_meadow", 2.0, -20.0)
    mid = scatter_density("medium_meadow", 2.0, -8.0)
    far = scatter_density("medium_meadow", 2.0, 18.0)
    assert near > mid > far
    assert mid >= 0.28 * 2.2 * 0.9  # readable midground still has clumps


if __name__ == "__main__":
    test_zones_are_physical_and_varied()
    test_negative_space_exists()
    test_density_falls_with_distance_but_not_to_a_plane()
    print("cinematic_meadow_v1_test PASS")
