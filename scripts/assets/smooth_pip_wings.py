#!/usr/bin/env python3
"""Light-smooth only Pip wing verts after enlargement. No retopo."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from revise_pip_color_wings import is_body_yellow  # noqa: E402
from revise_v2_primaries import (  # noqa: E402
    color_map,
    mesh_obj,
    render_pair,
    render_turnaround,
    save_blend,
    snap_to_ground,
    world_bounds,
)


def argv_after_dash():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]


def main() -> int:
    pip_path = Path(argv_after_dash()[argv_after_dash().index("--pip") + 1])
    goat = Path(argv_after_dash()[argv_after_dash().index("--goat") + 1])
    out = Path(argv_after_dash()[argv_after_dash().index("--out") + 1])
    bpy.ops.wm.open_mainfile(filepath=str(pip_path), load_ui=False)
    obj = mesh_obj()
    colors, _ = color_map(obj)
    mw = obj.matrix_world
    wing_ids = []
    for vid, col in colors.items():
        if not is_body_yellow(col):
            continue
        world = mw @ obj.data.vertices[vid].co
        if 0.16 < world.z < 1.30 and abs(world.y) > 0.17 and world.x > -0.22:
            wing_ids.append(vid)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    verts = [bm.verts[i] for i in wing_ids if i < len(bm.verts)]
    bmesh.ops.smooth_vert(bm, verts=verts, factor=0.42, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.smooth_vert(bm, verts=verts, factor=0.28, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    snap_to_ground(obj)
    save_blend(pip_path)
    clean = out / "clean"
    clean.mkdir(parents=True, exist_ok=True)
    renders = render_turnaround("pip_revised", clean)
    pair = render_pair(pip_path, goat, clean)
    (out / "WING_SMOOTH.json").write_text(json.dumps({"wing_ids": len(wing_ids), "pair": pair, "renders": renders}, indent=2) + "\n")
    print(json.dumps({"ok": True, "wing_ids": len(wing_ids), "ratio": pair["ratio"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
