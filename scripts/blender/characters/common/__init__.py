"""Pure helpers for the TivvleJoy character build department.

These modules must import without Blender. ``bpy`` is detected lazily and never
faked into a production PASS.
"""

from __future__ import annotations

from .bpy_guard import detect_bpy, require_bpy
from .io import emit, parse_args, write_report
from .stages import BUILD_STAGES, blocked_stage, stage_record

__all__ = [
    "BUILD_STAGES",
    "blocked_stage",
    "detect_bpy",
    "emit",
    "parse_args",
    "require_bpy",
    "stage_record",
    "write_report",
]
