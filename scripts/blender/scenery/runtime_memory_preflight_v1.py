#!/usr/bin/env python3
"""TIVVLEJOY_RUNTIME_MEMORY_PREFLIGHT_V1

Zero-bpy fail-fast budget. Scales from detected system memory.
Blocks Cycles init when the scene is already too close to OOM.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

SCHEMA = "TIVVLEJOY_RUNTIME_MEMORY_PREFLIGHT_V1"
FAIL_CODE = "RUNTIME_MEMORY_BUDGET_EXCEEDED"

# Evidence: 16 GiB / 0 swap, pre-Cycles RSS 12.8 GiB (80%), available 2.7 GiB,
# then Cycles init OOM-killed blender at ~14.9 GiB anon RSS.
RSS_FRACTION_BLOCK = 0.68
AVAILABLE_FRACTION_REQUIRED = 0.25
AVAILABLE_ABS_FLOOR_BYTES = 3 * 1024 * 1024 * 1024
AVAILABLE_ABS_CEIL_BYTES = 8 * 1024 * 1024 * 1024
SMALL_MACHINE_TOTAL_BYTES = 8 * 1024 * 1024 * 1024


def detect_system_memory(meminfo_text: str | None = None, status_text: str | None = None) -> dict[str, Any]:
    info: dict[str, int] = {}
    text = meminfo_text
    if text is None:
        try:
            text = Path("/proc/meminfo").read_text(encoding="utf-8")
        except OSError:
            text = ""
    for line in text.splitlines():
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
    rss = None
    status = status_text
    if status is None:
        try:
            status = Path("/proc/self/status").read_text(encoding="utf-8")
        except OSError:
            status = ""
    for line in status.splitlines():
        if line.startswith("VmRSS:"):
            rss = int(line.split()[1]) * 1024
            break
    return {
        "memTotal": info.get("MemTotal"),
        "memAvailable": info.get("MemAvailable"),
        "memFree": info.get("MemFree"),
        "swapTotal": info.get("SwapTotal") or 0,
        "swapFree": info.get("SwapFree") or 0,
        "rss": rss,
    }


def required_available_bytes(mem_total: int) -> int:
    if mem_total <= 0:
        return AVAILABLE_ABS_FLOOR_BYTES
    fractional = int(mem_total * AVAILABLE_FRACTION_REQUIRED)
    floor = AVAILABLE_ABS_FLOOR_BYTES
    if mem_total < SMALL_MACHINE_TOTAL_BYTES:
        floor = int(mem_total * 0.20)
    return max(floor, min(AVAILABLE_ABS_CEIL_BYTES, fractional))


def rss_block_bytes(mem_total: int) -> int:
    return int(mem_total * RSS_FRACTION_BLOCK)


def cycles_preflight(
    *,
    mem_total: int,
    mem_available: int,
    rss: int,
    swap_total: int = 0,
    object_count: int = 0,
    mesh_count: int = 0,
    image_count: int = 0,
    estimated_texture_bytes: int = 0,
    estimated_additional_bytes: int = 0,
    expected_asset_manifest: list[str] | None = None,
    base_vertices: int = 0,
    evaluated_vertices: int | None = None,
    component_peak_history: dict[str, int] | None = None,
    expected_cycles_sync_bytes: int | None = None,
) -> dict[str, Any]:
    need = required_available_bytes(mem_total)
    rss_cap = rss_block_bytes(mem_total)
    extra = max(int(estimated_additional_bytes), 0)
    predicted_available = int(mem_available) - extra
    blockers: list[str] = []
    if mem_available < need:
        blockers.append("AVAILABLE_RAM_BELOW_HEADROOM")
    if rss > rss_cap:
        blockers.append("RSS_FRACTION_EXCEEDED")
    if extra and predicted_available < need:
        blockers.append("PREDICTED_CYCLES_HEADROOM")
    ok = not blockers
    return {
        "schema": SCHEMA,
        "ok": ok,
        "code": None if ok else FAIL_CODE,
        "blockers": blockers,
        "memTotal": mem_total,
        "memAvailable": mem_available,
        "rss": rss,
        "swapTotal": swap_total,
        "requiredAvailable": need,
        "rssCap": rss_cap,
        "rssFractionBlock": RSS_FRACTION_BLOCK,
        "availableFractionRequired": AVAILABLE_FRACTION_REQUIRED,
        "objectCount": object_count,
        "meshCount": mesh_count,
        "imageCount": image_count,
        "estimatedTextureBytes": estimated_texture_bytes,
        "estimatedAdditionalBytes": extra,
        "predictedAvailable": predicted_available,
        "expectedAssetManifest": list(expected_asset_manifest or []),
        "headroomBytes": mem_available - need,
        "scaledFromDetectedMemory": True,
        "baseVertices": int(base_vertices or 0),
        "evaluatedVertices": evaluated_vertices,
        "componentPeakHistory": dict(component_peak_history or {}),
        "expectedCyclesSyncBytes": expected_cycles_sync_bytes,
    }


def assert_cycles_allowed(receipt: dict[str, Any]) -> None:
    if str(receipt.get("schema") or "") != SCHEMA:
        raise ValueError("RUNTIME_MEMORY_PREFLIGHT_SCHEMA_INVALID")
    if not bool(receipt.get("ok")):
        raise ValueError(str(receipt.get("code") or FAIL_CODE))
