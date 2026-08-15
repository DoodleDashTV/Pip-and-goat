#!/usr/bin/env python3
"""Analyze Pip/Goat primary meshes for the sculpt-revision gate. No saves."""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector


def mesh_obj():
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    return meshes[0] if meshes else None


def world_bounds(obj):
    coords = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    xs, ys, zs = zip(*[(c.x, c.y, c.z) for c in coords])
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def sample_colors(obj):
    img = None
    for image in bpy.data.images:
        if image.size[0] > 0:
            img = image
            break
    if img is None or not obj.data.uv_layers:
        return None, None
    work = img.copy()
    work.scale(512, 512)
    uv = obj.data.uv_layers.active.data
    pixels = work.pixels[:]
    w, h = 512, 512
    # Map loop UV -> vertex average color
    acc = defaultdict(lambda: [0.0, 0.0, 0.0, 0])
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            vert = obj.data.loops[li].vertex_index
            u, v = uv[li].uv
            x = min(max(int(u * w) % w, 0), w - 1)
            y = min(max(int(v * h) % h, 0), h - 1)
            i = (y * w + x) * 4
            acc[vert][0] += pixels[i]
            acc[vert][1] += pixels[i + 1]
            acc[vert][2] += pixels[i + 2]
            acc[vert][3] += 1
    colors = {}
    for vid, (r, g, b, n) in acc.items():
        if n:
            colors[vid] = (r / n, g / n, b / n)
    return colors, img.name


def coral(c):
    r, g, b = c
    return r > 0.55 and 0.12 < g < 0.55 and b < 0.28 and r > g + 0.15


def teal(c):
    r, g, b = c
    return b > 0.18 and g > 0.22 and g > r + 0.08 and b > r + 0.05 and r < 0.35


def cinnamon(c):
    r, g, b = c
    return r > 0.35 and 0.12 < g < 0.45 and b < 0.22 and r > g + 0.08


def cream(c):
    r, g, b = c
    return r > 0.55 and g > 0.45 and b > 0.30 and abs(r - g) < 0.2


def cluster_xy(points, radius):
    clusters = []
    used = [False] * len(points)
    for i, p in enumerate(points):
        if used[i]:
            continue
        group = [p]
        used[i] = True
        changed = True
        while changed:
            changed = False
            for j, q in enumerate(points):
                if used[j]:
                    continue
                if min((q - g).length for g in group) <= radius:
                    used[j] = True
                    group.append(q)
                    changed = True
        clusters.append(group)
    clusters.sort(key=len, reverse=True)
    return clusters


def analyze(label: str) -> dict:
    obj = mesh_obj()
    mn, mx = world_bounds(obj)
    size = mx - mn
    colors, img_name = sample_colors(obj)
    mw = obj.matrix_world
    verts = obj.data.vertices
    report = {
        "label": label,
        "name": obj.name,
        "verts": len(verts),
        "min": list(mn),
        "max": list(mx),
        "size": list(size),
        "height": size.z,
        "image": img_name,
    }
    if not colors:
        return report

    def collect(pred, extra=None):
        pts = []
        for vid, col in colors.items():
            if not pred(col):
                continue
            world = mw @ verts[vid].co
            if extra and not extra(world):
                continue
            pts.append(world)
        return pts

    head_z = mn.z + size.z * 0.72
    crest = collect(coral, lambda p: p.z >= head_z)
    bag = collect(teal, lambda p: p.z < mn.z + size.z * 0.55)
    strap = collect(teal, lambda p: p.z >= mn.z + size.z * 0.55)
    feet = collect(cinnamon, lambda p: p.z < mn.z + size.z * 0.18)
    back_mark = collect(cinnamon, lambda p: p.x < (mn.x + mx.x) * 0.5 and p.z > mn.z + size.z * 0.45)

    def summarize(pts, radius):
        if not pts:
            return {"count": 0}
        clusters = cluster_xy(pts, radius)
        return {
            "count": len(pts),
            "clusters": len(clusters),
            "cluster_sizes": [len(c) for c in clusters[:8]],
            "centroid": list(sum(pts, Vector()) / len(pts)),
            "min": list(Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))),
            "max": list(Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))),
        }

    report["crest"] = summarize(crest, 0.06)
    report["satchel_low"] = summarize(bag, 0.08)
    report["satchel_high"] = summarize(strap, 0.10)
    report["feet"] = summarize(feet, 0.08)
    report["back_cinnamon"] = summarize(back_mark, 0.08)
    return report


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    out = Path(argv[argv.index("--out") + 1])
    reports = []
    for label, path in (
        ("pip", argv[argv.index("--pip") + 1]),
        ("goat", argv[argv.index("--goat") + 1]),
    ):
        bpy.ops.wm.open_mainfile(filepath=path, load_ui=False)
        reports.append(analyze(label))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(reports, indent=2) + "\n")
    print(json.dumps(reports, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
