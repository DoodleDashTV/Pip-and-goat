#!/usr/bin/env python3
"""Confirm Goat cornea hide flags and remaining extras. No edits."""
from __future__ import annotations

import json
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path("/workspace")
PATH = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution/goat_highres_candidate.blend"
OUT = REPO / "theatrical-foundation/proposed/final-character-production/reports/TARGETED_CORNEA_VERIFY.json"


def world_bounds(obj):
    coords = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    xs, ys, zs = zip(*[(c.x, c.y, c.z) for c in coords])
    return [min(xs), min(ys), min(zs)], [max(xs), max(ys), max(zs)]


def main() -> int:
    bpy.ops.wm.open_mainfile(filepath=str(PATH), load_ui=False)
    rows = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        mn, mx = world_bounds(obj)
        rows.append({
            "name": obj.name,
            "hide_render": bool(obj.hide_render),
            "hide_viewport": bool(obj.hide_viewport),
            "location": list(obj.location),
            "dims": [mx[i] - mn[i] for i in range(3)],
            "materials": [s.material.name for s in obj.material_slots if s.material],
        })
    OUT.write_text(json.dumps({"objects": rows}, indent=2) + "\n")
    print(json.dumps({"objects": rows}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
