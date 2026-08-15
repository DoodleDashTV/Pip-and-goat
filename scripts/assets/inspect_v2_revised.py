#!/usr/bin/env python3
"""Measure proposed Pip/Goat revised meshes. No edits."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from revise_pip_color_wings import is_body_yellow  # noqa: E402
from revise_v2_primaries import cinnamon, color_map, coral, mesh_obj, teal, world_bounds  # noqa: E402


def argv_after_dash():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]


def main() -> int:
    path = Path(argv_after_dash()[argv_after_dash().index("--blend") + 1])
    kind = argv_after_dash()[argv_after_dash().index("--kind") + 1]
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False)
    obj = mesh_obj()
    mn, mx = world_bounds(obj)
    colors, img = color_map(obj)
    mw = obj.matrix_world
    verts = obj.data.vertices
    report = {
        "file": str(path),
        "kind": kind,
        "blender": bpy.app.version_string,
        "object": obj.name,
        "verts": len(verts),
        "tris": sum(len(p.vertices) - 2 for p in obj.data.polygons),
        "bounds": {"min": list(mn), "max": list(mx), "height": mx.z - mn.z},
        "images": [
            {
                "name": im.name,
                "size": list(im.size),
                "packed": bool(im.packed_file),
                "filepath": im.filepath,
            }
            for im in bpy.data.images
            if im.size[0] > 0
        ],
        "libraries": [lib.filepath for lib in bpy.data.libraries],
    }
    if kind == "pip":
        left, right, crest, bag, feet = [], [], [], [], []
        for vid, col in colors.items():
            world = mw @ verts[vid].co
            if coral(col) and world.z >= 1.55:
                crest.append(world)
            if teal(col):
                bag.append(world)
            if cinnamon(col) and world.z < 0.16:
                feet.append(world)
            if is_body_yellow(col) and 0.16 < world.z < 1.32 and abs(world.y) > 0.17 and world.x > -0.22:
                (left if world.y >= 0 else right).append(world)
        def ext(pts):
            if not pts:
                return {}
            return {
                "count": len(pts),
                "min": [min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)],
                "max": [max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)],
            }
        report["wings"] = {"left": ext(left), "right": ext(right)}
        report["crest"] = ext(crest)
        if crest:
            tips = sorted(crest, key=lambda p: p.z, reverse=True)[:8]
            report["crest_high"] = [[p.x, p.y, p.z] for p in tips]
        report["teal"] = ext(bag)
        report["feet"] = ext(feet)
    else:
        back = []
        for vid, col in colors.items():
            world = mw @ verts[vid].co
            r, g, b = col
            if world.x < -0.02 and 1.4 < world.z < 2.3 and r > 0.28 and r > g + 0.05:
                back.append((world, col))
        report["back_mark_count"] = len(back)
        if back:
            zs = [p.z for p, _ in back]
            ys = [p.y for p, _ in back]
            cols = [c for _, c in back]
            report["back_mark"] = {
                "z": [min(zs), max(zs)],
                "y": [min(ys), max(ys)],
                "mean_rgb": [
                    sum(c[0] for c in cols) / len(cols),
                    sum(c[1] for c in cols) / len(cols),
                    sum(c[2] for c in cols) / len(cols),
                ],
            }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
