from __future__ import annotations

from typing import Any

BUILD_STAGES = (
    "SOURCE_INTAKE",
    "SOURCE_HASH_LOCK",
    "BLENDER_VERSION_CHECK",
    "OBJECT_INVENTORY",
    "MATERIAL_INVENTORY",
    "TEXTURE_INVENTORY",
    "UV_VALIDATION",
    "TOPOLOGY_AUDIT",
    "SCALE_ORIENTATION_NORMALIZATION",
    "CHARACTER_SEMANTIC_MAPPING",
    "RIG_GUIDE_GENERATION",
    "SKELETON_BUILD",
    "CONTROL_RIG_BUILD",
    "INITIAL_SKIN_BIND",
    "WEIGHT_REFINEMENT",
    "FACIAL_SYSTEM_BUILD",
    "VISEME_SYSTEM_BUILD",
    "SECONDARY_CONTROLS",
    "CORRECTIVE_DEFORMATION_BUILD",
    "ACCESSORY_BINDING",
    "DEFORMATION_TESTS",
    "ANIMATION_TESTS",
    "PERFORMANCE_PROFILE",
    "RENDER_QA",
    "EXPORT_QA",
    "CHARACTER_MASTER_GATE",
)


def stage_record(
    stage: str,
    disposition: str,
    reason: str,
    **extra: Any,
) -> dict[str, Any]:
    if disposition not in {"CREATED", "REUSED", "UPDATED", "BLOCKED", "FAILED"}:
        raise ValueError(f"Unknown disposition {disposition}")
    return {"stage": stage, "disposition": disposition, "reason": reason, **extra}


def blocked_stage(stage: str, reason: str) -> dict[str, Any]:
    return stage_record(stage, "BLOCKED", reason, status="BLOCKED_REAL_EXECUTION_REQUIRED", simulated=True)


def executed_stage(stage: str, reason: str, **extra: Any) -> dict[str, Any]:
    return stage_record(stage, extra.pop("disposition", "CREATED"), reason, status="EXECUTED", simulated=False, **extra)


def failed_stage(stage: str, reason: str, **extra: Any) -> dict[str, Any]:
    return stage_record(stage, "FAILED", reason, status="FAILED", simulated=False, **extra)
