#!/usr/bin/env python3
from docker_args_v1 import CURRENT_PIN_DOCKER_ARGS, PREFERRED_BAKED_DOCKER_ARGS, docker_args_compatible
from host_memory_receipt_v1 import collect_host_memory_receipt
from startup_markers_v1 import MARKERS, marker_payload


def test_rejects_nested_shell_docker_args():
    row = docker_args_compatible("sh -c 'cd /opt/ddp-worker && node -e \"x\"'")
    assert row["ok"] is False
    assert "NESTED_SHELL_DOCKER_ARGS" in row["blockers"]


def test_accepts_node_cmd_shape():
    assert docker_args_compatible(PREFERRED_BAKED_DOCKER_ARGS)["ok"] is True
    assert docker_args_compatible(CURRENT_PIN_DOCKER_ARGS)["ok"] is True
    assert CURRENT_PIN_DOCKER_ARGS.split()[0] == "node"


def test_markers_and_receipt():
    assert "IMAGE_PROCESS_STARTED" in MARKERS
    assert marker_payload("NODE_ENTRY_STARTED")["stage"] == "NODE_ENTRY_STARTED"
    row = collect_host_memory_receipt(
        meminfo_text="MemTotal: 16777216 kB\nMemAvailable: 15000000 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n",
        gpu_vram_bytes=0,
        hdri_identity="Image0001.jpg:15000x7500",
        source_manifest=["hdri_jpg"],
    )
    assert row["stopWorker"] is True
    assert "SYSTEM_RAM_BELOW_24GIB" in row["blockers"]
    ok = collect_host_memory_receipt(
        meminfo_text="MemTotal: 33554432 kB\nMemAvailable: 30000000 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n",
        gpu_vram_bytes=24 * 1024 * 1024 * 1024,
        hdri_identity="Image0001.jpg:15000x7500",
        source_manifest=["hdri_jpg"],
    )
    assert ok["ok"] is True
    assert ok["blenderAllowed"] is True


if __name__ == "__main__":
    test_rejects_nested_shell_docker_args()
    test_accepts_node_cmd_shape()
    test_markers_and_receipt()
    print("startup_canary_v1_test PASS")
