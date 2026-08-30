#!/usr/bin/env python3
from runtime_memory_preflight_v1 import (
    AVAILABLE_ABS_FLOOR_BYTES,
    FAIL_CODE,
    RSS_FRACTION_BLOCK,
    SCHEMA,
    assert_cycles_allowed,
    cycles_preflight,
    detect_system_memory,
    required_available_bytes,
    rss_block_bytes,
)


def test_budget_scales_from_detected_memory():
    small = required_available_bytes(8 * 1024 * 1024 * 1024)
    mid = required_available_bytes(16 * 1024 * 1024 * 1024)
    huge = required_available_bytes(128 * 1024 * 1024 * 1024)
    assert small < mid
    assert mid == AVAILABLE_ABS_FLOOR_BYTES or mid >= AVAILABLE_ABS_FLOOR_BYTES
    assert huge <= 8 * 1024 * 1024 * 1024
    assert rss_block_bytes(16 * 1024 * 1024 * 1024) == int(16 * 1024 * 1024 * 1024 * RSS_FRACTION_BLOCK)


def test_blocks_the_confirmed_16gib_pre_cycles_state():
    # Prior probe: 16 GiB total, 2.7 GiB available, 12.8 GiB RSS.
    receipt = cycles_preflight(
        mem_total=16 * 1024 * 1024 * 1024,
        mem_available=int(2.7 * 1024 * 1024 * 1024),
        rss=int(12.8 * 1024 * 1024 * 1024),
        swap_total=0,
        object_count=124,
        mesh_count=112,
        image_count=22,
    )
    assert receipt["schema"] == SCHEMA
    assert receipt["ok"] is False
    assert receipt["code"] == FAIL_CODE
    assert "AVAILABLE_RAM_BELOW_HEADROOM" in receipt["blockers"]
    assert "RSS_FRACTION_EXCEEDED" in receipt["blockers"]
    try:
        assert_cycles_allowed(receipt)
        raise AssertionError("expected block")
    except ValueError as exc:
        assert FAIL_CODE in str(exc)


def test_predicted_cycles_increment_blocks():
    receipt = cycles_preflight(
        mem_total=16 * 1024 * 1024 * 1024,
        mem_available=int(14.0 * 1024 * 1024 * 1024),
        rss=int(0.4 * 1024 * 1024 * 1024),
        estimated_additional_bytes=int(12.5 * 1024 * 1024 * 1024),
    )
    assert receipt["ok"] is False
    assert "PREDICTED_CYCLES_HEADROOM" in receipt["blockers"]


def test_allows_healthy_headroom():
    receipt = cycles_preflight(
        mem_total=16 * 1024 * 1024 * 1024,
        mem_available=int(8.0 * 1024 * 1024 * 1024),
        rss=int(4.0 * 1024 * 1024 * 1024),
        swap_total=0,
        object_count=40,
        mesh_count=30,
        image_count=8,
    )
    assert receipt["ok"] is True
    assert receipt["code"] is None
    assert_cycles_allowed(receipt)


def test_detect_system_memory_parses_proc_text():
    meminfo = (
        "MemTotal:       16398384 kB\n"
        "MemAvailable:   15505448 kB\n"
        "SwapTotal:            0 kB\n"
        "SwapFree:             0 kB\n"
    )
    status = "VmRSS:\t  387809 kB\n"
    row = detect_system_memory(meminfo, status)
    assert row["memTotal"] == 16398384 * 1024
    assert row["swapTotal"] == 0
    assert row["rss"] == 387809 * 1024


if __name__ == "__main__":
    test_budget_scales_from_detected_memory()
    test_blocks_the_confirmed_16gib_pre_cycles_state()
    test_allows_healthy_headroom()
    test_detect_system_memory_parses_proc_text()
    print("runtime_memory_preflight_v1_test PASS")
