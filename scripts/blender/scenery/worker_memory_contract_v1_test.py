#!/usr/bin/env python3
from worker_memory_contract_v1 import FAIL_CODE, SCHEMA, evaluate_worker_memory_contract


def test_rejects_16gib_cursor_vm():
    row = evaluate_worker_memory_contract(
        system_ram_bytes=16 * 1024 * 1024 * 1024,
        gpu_vram_bytes=0,
        source_manifest=["hdri_jpg", "beech_a"],
        hdri_identity="Image0001.jpg:15000x7500",
        render_profile="PROOF_A_STILL",
    )
    assert row["schema"] == SCHEMA
    assert row["ok"] is False
    assert row["code"] == FAIL_CODE
    assert "SYSTEM_RAM_BELOW_24GIB" in row["blockers"]


def test_accepts_32gib_4090_proof_a():
    row = evaluate_worker_memory_contract(
        system_ram_bytes=32 * 1024 * 1024 * 1024,
        gpu_vram_bytes=24 * 1024 * 1024 * 1024,
        memory_prediction_bytes=14 * 1024 * 1024 * 1024,
        source_manifest=["festuca_a", "carex_a", "fern_a", "beech_a", "ecokit_rocks", "hdri_jpg"],
        hdri_identity="Image0001.jpg:15000x7500",
        hdri_derivative_identity="H8:8192x4096",
        blender_version="4.2.2",
        cycles_device="GPU",
        render_profile="PROOF_A_STILL",
        paid_create_allowed=False,
    )
    assert row["ok"] is True
    assert row["code"] is None


def test_blocks_paid_create_flag():
    row = evaluate_worker_memory_contract(
        system_ram_bytes=32 * 1024 * 1024 * 1024,
        gpu_vram_bytes=24 * 1024 * 1024 * 1024,
        source_manifest=["hdri_jpg"],
        hdri_identity="Image0001.jpg:15000x7500",
        paid_create_allowed=True,
    )
    assert row["ok"] is False
    assert "PAID_CREATE_NOT_AUTHORIZED" in row["blockers"]


if __name__ == "__main__":
    test_rejects_16gib_cursor_vm()
    test_accepts_32gib_4090_proof_a()
    test_blocks_paid_create_flag()
    print("worker_memory_contract_v1_test PASS")
