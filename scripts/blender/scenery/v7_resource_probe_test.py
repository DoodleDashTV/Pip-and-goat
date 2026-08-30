#!/usr/bin/env python3
from v7_resource_probe import _disk, _meminfo, snapshot


def test_snapshot_has_resource_fields():
    row = snapshot("unit")
    assert row["event"] == "resource_snapshot"
    assert row["label"] == "unit"
    assert "rss" in row
    assert "memAvailable" in row
    assert "diskFree" in row
    assert row["diskFree"] > 0


def test_meminfo_and_disk_are_dicts():
    mem = _meminfo()
    disk = _disk()
    assert "memTotal" in mem
    assert disk["diskFree"] > 0


if __name__ == "__main__":
    test_snapshot_has_resource_fields()
    test_meminfo_and_disk_are_dicts()
    print("v7_resource_probe_test PASS")
