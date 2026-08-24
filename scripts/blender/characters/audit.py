from __future__ import annotations

from typing import Any

from common.bpy_guard import detect_bpy


def inventory_scene() -> dict[str, Any]:
    bpy = detect_bpy()
    if bpy is None:
        return {
            "status": "BLOCKED_REAL_EXECUTION_REQUIRED",
            "objects": [],
            "materials": [],
            "images": [],
            "reason": "bpy is unavailable. Object/material/texture inventory was not faked.",
        }
    return {
        "status": "INSPECTED",
        "objects": sorted(obj.name for obj in bpy.data.objects),
        "materials": sorted(mat.name for mat in bpy.data.materials),
        "images": sorted(img.name for img in bpy.data.images),
    }
