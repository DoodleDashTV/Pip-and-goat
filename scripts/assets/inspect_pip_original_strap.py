#!/usr/bin/env python3
"""Inspect strap clusters on the untouched original Pip. No edits."""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "assets"))

from build_final_character_production import PIP_HEIGHT, bounds, meshes, snap_and_scale  # noqa: E402
from inspect_pip_long_wing_candidate import sample_colors, teal  # noqa: E402
from refine_v2_overnight import adjacency  # noqa: E402

GLB = Path("/tmp/pip_long_wing_candidate_original.glb")
OUT = REPO / "theatrical-foundation/proposed/final-character-production/reports/PIP_ORIGINAL_STRAP_INSPECT.json"


def main() -> int:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(GLB))
    snap_and_scale(PIP_HEIGHT)
    obj = meshes()[0]
    obj.name = "Pip_LongWingOriginal"
    colors, _ = sample_colors(obj)
    mw = obj.matrix_world
    verts = obj.data.vertices
    adj = adjacency(obj)
    teal_ids = [vid for vid, col in colors.items() if teal(col)]
    clusters = []
    seen = set()
    for seed in teal_ids:
        if seed in seen:
            continue
        stack = [seed]
        group = []
        while stack:
            vid = stack.pop()
            if vid in seen or vid not in colors or not teal(colors[vid]):
                continue
            seen.add(vid)
            group.append(vid)
            stack.extend(adj[vid])
        if len(group) < 40:
            continue
        pts = [mw @ verts[vid].co for vid in group]
        xs, ys, zs = zip(*[(p.x, p.y, p.z) for p in pts])
        clusters.append({
            "n": len(group),
            "center": [sum(xs) / len(xs), sum(ys) / len(ys), sum(zs) / len(zs)],
            "x": [min(xs), max(xs)],
            "y": [min(ys), max(ys)],
            "z": [min(zs), max(zs)],
            "span_x": max(xs) - min(xs),
            "span_y": max(ys) - min(ys),
            "span_z": max(zs) - min(zs),
            "front_frac": sum(1 for p in pts if p.x > 0.02) / len(pts),
            "back_frac": sum(1 for p in pts if p.x < -0.02) / len(pts),
            "left_frac": sum(1 for p in pts if p.y > 0.02) / len(pts),
            "right_frac": sum(1 for p in pts if p.y < -0.02) / len(pts),
        })
    clusters.sort(key=lambda c: c["n"], reverse=True)
    mn, mx = bounds()
    report = {
        "object": obj.name,
        "verts": len(verts),
        "teal_n": len(teal_ids),
        "clusters": clusters[:12],
        "height": mx.z - mn.z,
    }
    OUT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
