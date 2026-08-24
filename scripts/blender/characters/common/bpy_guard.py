from __future__ import annotations

from typing import Any


def detect_bpy() -> Any | None:
    try:
        import bpy  # type: ignore
    except ImportError:
        return None
    return bpy


def require_bpy() -> Any:
    bpy = detect_bpy()
    if bpy is None:
        raise RuntimeError("BLOCKED_REAL_EXECUTION_REQUIRED: bpy is not available.")
    return bpy
