#!/usr/bin/env python3
"""Print Goat orange/cinnamon z bands. No edits."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from revise_v2_primaries import color_map, mesh_obj, world_bounds  # noqa: E402


def main() -> int:
    bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index("--") + 2], load_ui=False)
    obj = mesh_obj()
    colors, _ = color_map(obj)
    mw = obj.matrix_world
    mn, mx = world_bounds(obj)
    orange, cinnamon, back = [], [], []
    for vid, col in colors.items():
        r, g, b = col
        w = mw @ obj.data.vertices[vid].co
        if r > 0.50 and 0.12 < g < 0.48 and b < 0.22 and r > g + 0.18:
            orange.append(w)
        if r > 0.32 and r > g + 0.08 and b < 0.22 and g < 0.42:
            cinnamon.append(w)
        if w.x < -0.06 and 1.6 < w.z < 2.5 and abs(w.y) < 0.28:
            back.append((w, col))
    def band(pts):
        if not pts:
            return {}
        zs = [p.z for p in pts]
        return {"n": len(pts), "z": [min(zs), max(zs)], "z_med": sorted(zs)[len(zs)//2]}
    print(json.dumps({
        "height": mx.z - mn.z,
        "orange": band(orange),
        "cinnamon": band(cinnamon),
        "back_center_mean_rgb": [
            sum(c[0] for _, c in back) / max(len(back), 1),
            sum(c[1] for _, c in back) / max(len(back), 1),
            sum(c[2] for _, c in back) / max(len(back), 1),
        ] if back else [],
        "back_center_n": len(back),
        "back_z": [min(p.z for p, _ in back), max(p.z for p, _ in back)] if back else [],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
