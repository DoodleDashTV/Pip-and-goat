"""Staged worker startup markers. No art changes. No paid mutations."""
from __future__ import annotations

SCHEMA = "TIVVLEJOY_WORKER_STARTUP_MARKERS_V1"

MARKERS = (
    "IMAGE_PROCESS_STARTED",
    "NODE_ENTRY_STARTED",
    "R2_CLIENT_STARTED",
    "SOURCE_MANIFEST_FETCH_STARTED",
    "SOURCE_MANIFEST_FETCH_COMPLETE",
    "HOST_MEMORY_RECEIPT_WRITTEN",
    "BLENDER_EXEC_STARTED",
    "BLENDER_PROCESS_STARTED",
    "CYCLES_DEVICE_VERIFIED",
    "RENDER_STARTED",
)

LAUNCH_STAGES = (
    "POD_CREATED",
    "HOST_ASSIGNED",
    "IMAGE_PULLING",
    "CONTAINER_STARTED",
    "WORKER_STARTED",
    "BLENDER_STARTED",
)


def marker_payload(stage: str, **extra) -> dict:
    if stage not in MARKERS:
        raise ValueError(f"unknown startup marker: {stage}")
    row = {"schema": SCHEMA, "stage": stage, **extra}
    return row


def is_pre_render_marker(stage: str) -> bool:
    return stage in MARKERS and stage not in {"CYCLES_DEVICE_VERIFIED", "RENDER_STARTED"}
