"""Actual worker host memory receipt. Must run before large downloads or Blender."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "blender/scenery"))
from worker_memory_contract_v1 import (
    MINIMUM_SYSTEM_RAM_BYTES,
    RECOMMENDED_SYSTEM_RAM_BYTES,
    TARGET_GPU_VRAM_BYTES,
    evaluate_worker_memory_contract,
)

SCHEMA = "TIVVLEJOY_HOST_MEMORY_RECEIPT_V1"
STOP_CODE = "SYSTEM_RAM_BELOW_24GIB"


def read_meminfo(text: str | None = None) -> dict[str, int]:
    raw = text if text is not None else Path("/proc/meminfo").read_text(encoding="utf-8")
    info: dict[str, int] = {}
    for line in raw.splitlines():
        if ":" not in line:
            continue
        key, rest = line.split(":", 1)
        parts = rest.split()
        if not parts:
            continue
        try:
            info[key] = int(parts[0]) * 1024
        except ValueError:
            continue
    return {
        "memTotal": int(info.get("MemTotal") or 0),
        "memAvailable": int(info.get("MemAvailable") or 0),
        "swapTotal": int(info.get("SwapTotal") or 0),
        "swapFree": int(info.get("SwapFree") or 0),
    }


def collect_host_memory_receipt(
    *,
    meminfo_text: str | None = None,
    gpu_name: str | None = None,
    gpu_vram_bytes: int | None = None,
    hdri_identity: str | None = None,
    hdri_derivative_identity: str | None = None,
    source_manifest: list[str] | None = None,
    blender_version: str = "4.2.2",
    cycles_device: str = "GPU",
) -> dict[str, Any]:
    mem = read_meminfo(meminfo_text)
    warnings: list[str] = []
    blockers: list[str] = []
    if mem["memTotal"] < MINIMUM_SYSTEM_RAM_BYTES:
        blockers.append(STOP_CODE)
    elif mem["memTotal"] < RECOMMENDED_SYSTEM_RAM_BYTES:
        warnings.append("SYSTEM_RAM_BELOW_32GIB_PREFERRED")
    if gpu_vram_bytes is not None and int(gpu_vram_bytes) < TARGET_GPU_VRAM_BYTES:
        blockers.append("GPU_VRAM_BELOW_24GIB")
    contract = evaluate_worker_memory_contract(
        system_ram_bytes=mem["memTotal"],
        gpu_vram_bytes=gpu_vram_bytes,
        source_manifest=source_manifest or ["hdri_jpg"],
        hdri_identity=hdri_identity or "pending",
        hdri_derivative_identity=hdri_derivative_identity,
        blender_version=blender_version,
        cycles_device=cycles_device,
        render_profile="PROOF_A_STILL",
        paid_create_allowed=False,
    )
    return {
        "schema": SCHEMA,
        "ok": not blockers,
        "stopWorker": bool(blockers),
        "code": None if not blockers else STOP_CODE if STOP_CODE in blockers else blockers[0],
        "blockers": blockers,
        "warnings": warnings,
        "gpuName": gpu_name,
        "gpuVramBytes": gpu_vram_bytes,
        "blenderAllowed": not blockers,
        **mem,
        "catalogContract": contract,
    }
