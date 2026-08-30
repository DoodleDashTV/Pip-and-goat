#!/usr/bin/env python3
"""TIVVLEJOY_WORKER_MEMORY_CONTRACT_V1

Zero-bpy gate. No paid worker may start if this fails.
"""
from __future__ import annotations

from typing import Any

SCHEMA = "TIVVLEJOY_WORKER_MEMORY_CONTRACT_V1"
FAIL_CODE = "WORKER_MEMORY_CONTRACT_FAILED"

MINIMUM_SYSTEM_RAM_BYTES = 24 * 1024 * 1024 * 1024
RECOMMENDED_SYSTEM_RAM_BYTES = 32 * 1024 * 1024 * 1024
TARGET_GPU_VRAM_BYTES = 24 * 1024 * 1024 * 1024
REQUIRED_BLENDER = "4.2.2"
REQUIRED_ENGINE = "CYCLES"


def evaluate_worker_memory_contract(
    *,
    system_ram_bytes: int,
    gpu_vram_bytes: int | None = None,
    memory_prediction_bytes: int | None = None,
    source_manifest: list[str] | None = None,
    hdri_identity: str | None = None,
    hdri_derivative_identity: str | None = None,
    blender_version: str = REQUIRED_BLENDER,
    cycles_device: str = "GPU",
    render_profile: str = "PROOF_A_STILL",
    paid_create_allowed: bool = False,
) -> dict[str, Any]:
    blockers: list[str] = []
    if int(system_ram_bytes or 0) < MINIMUM_SYSTEM_RAM_BYTES:
        blockers.append("SYSTEM_RAM_BELOW_24GIB")
    if gpu_vram_bytes is not None and int(gpu_vram_bytes) < TARGET_GPU_VRAM_BYTES:
        blockers.append("GPU_VRAM_BELOW_24GIB")
    if blender_version != REQUIRED_BLENDER:
        blockers.append("BLENDER_VERSION_MISMATCH")
    if str(cycles_device or "").upper() not in {"GPU", "CPU"}:
        blockers.append("CYCLES_DEVICE_UNKNOWN")
    if not hdri_identity:
        blockers.append("HDRI_IDENTITY_MISSING")
    if not source_manifest:
        blockers.append("SOURCE_MANIFEST_MISSING")
    if render_profile not in {"PROOF_A_STILL", "PROOF_A_360", "PROOF_A_540", "HDRI_QUAL"}:
        blockers.append("RENDER_PROFILE_UNSUPPORTED")
    if paid_create_allowed:
        blockers.append("PAID_CREATE_NOT_AUTHORIZED")
    if memory_prediction_bytes is not None and int(memory_prediction_bytes) >= int(system_ram_bytes or 0):
        blockers.append("PREDICTED_PEAK_EXCEEDS_SYSTEM_RAM")
    ok = not blockers
    return {
        "schema": SCHEMA,
        "ok": ok,
        "code": None if ok else FAIL_CODE,
        "blockers": blockers,
        "minimumSystemRam": MINIMUM_SYSTEM_RAM_BYTES,
        "recommendedSystemRam": RECOMMENDED_SYSTEM_RAM_BYTES,
        "gpuVram": TARGET_GPU_VRAM_BYTES,
        "memoryPrediction": memory_prediction_bytes,
        "sourceManifest": list(source_manifest or []),
        "hdriIdentity": hdri_identity,
        "hdriDerivativeIdentity": hdri_derivative_identity,
        "blenderVersion": blender_version,
        "cyclesDevice": cycles_device,
        "renderProfile": render_profile,
        "paidCreateAllowed": paid_create_allowed,
    }
