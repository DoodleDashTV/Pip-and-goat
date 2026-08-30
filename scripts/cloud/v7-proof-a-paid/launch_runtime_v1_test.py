#!/usr/bin/env python3
from launch import pod_uptime_seconds


def test_reads_nested_runtime_uptime():
    assert pod_uptime_seconds({"runtime": {"uptimeInSeconds": 12}}) == 12
    assert pod_uptime_seconds({"runtime": {"uptimeInSeconds": -3}}) == -3
    assert pod_uptime_seconds({"uptimeInSeconds": 4}) == 4
    assert pod_uptime_seconds({}) is None
    assert pod_uptime_seconds(None) is None


if __name__ == "__main__":
    test_reads_nested_runtime_uptime()
    print("launch_runtime_v1_test PASS")
