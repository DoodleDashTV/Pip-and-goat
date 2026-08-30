#!/usr/bin/env python3
from cycles_memory_predictor_v1 import MEASURED_COMPONENT_HWM_V3, SCHEMA, predict_cycles_sync


def test_predictor_adds_isolated_deltas_with_slack():
    row = predict_cycles_sync(
        component_peaks={"hdri": 300_000_000, "beech": 6_000_000_000},
        parts=["hdri", "beech"],
        empty_hwm=260_000_000,
        texture_bytes=450_000_000,
        base_vertices=259333,
        interaction_slack=1.15,
    )
    assert row["schema"] == SCHEMA
    assert row["predictedPeak"] > 6_000_000_000
    assert row["sumIsolatedDeltas"] == (300_000_000 - 260_000_000) + (6_000_000_000 - 260_000_000)


def test_measured_v3_history_keeps_hdri_as_largest_isolated_peak():
    assert MEASURED_COMPONENT_HWM_V3["hdri_15k"] > 5 * 1024 * 1024 * 1024
    assert MEASURED_COMPONENT_HWM_V3["beech"] < 1024 * 1024 * 1024
    row = predict_cycles_sync(
        component_peaks=MEASURED_COMPONENT_HWM_V3,
        parts=["hdri_15k", "beech"],
        empty_hwm=MEASURED_COMPONENT_HWM_V3["empty"],
    )
    assert row["predictedPeak"] > 5 * 1024 * 1024 * 1024


def test_unknown_parts_are_ignored():
    row = predict_cycles_sync(
        component_peaks={"hdri": 300_000_000},
        parts=["hdri", "mystery"],
        empty_hwm=260_000_000,
    )
    assert "mystery" not in row["componentPeaksUsed"]
    assert row["predictedPeak"] > 0


if __name__ == "__main__":
    test_predictor_adds_isolated_deltas_with_slack()
    test_measured_v3_history_keeps_hdri_as_largest_isolated_peak()
    test_unknown_parts_are_ignored()
    print("cycles_memory_predictor_v1_test PASS")
