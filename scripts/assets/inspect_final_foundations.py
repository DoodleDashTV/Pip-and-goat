#!/usr/bin/env python3
"""Inspect Prism working blends. No edits. No original-source overwrite.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/inspect_final_foundations.py
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
WORKING = REPO / "theatrical-foundation/proposed/final-character-production/working"
OUT = REPO / "theatrical-foundation/proposed/final-character-production/reports"


def coral(c):
    r, g, b = c
    return r > 0.55 and 0.12 < g < 0.55 and b < 0.28 and r > g + 0.15


def orange_cloth(c):
    r, g, b = c
    return r > 0.50 and 0.12 < g < 0.48 and b < 0.22 and r > g + 0.18


def cinnamon(c):
    r, g, b = c
    return r > 0.32 and r > g + 0.08 and b < 0.22 and g < 0.42


def teal(c):
    r, g, b = c
    return b > 0.18 and g > 0.22 and g > r + 0.08 and b > r + 0.05 and r < 0.35


def mesh_obj():
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("no mesh")
    return meshes[0]


def sample_colors(obj, size=256):
    img = next((image for image in bpy.data.images if image.size[0] > 4), None)
    if img is None or not obj.data.uv_layers:
        return {}, None
    work = img.copy()
    work.scale(size, size)
    pixels = work.pixels[:]
    uv = obj.data.uv_layers.active.data
    acc = defaultdict(lambda: [0.0, 0.0, 0.0, 0])
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            vid = obj.data.loops[li].vertex_index
            u, v = uv[li].uv
            x = min(max(int(u * size) % size, 0), size - 1)
            y = min(max(int(v * size) % size, 0), size - 1)
            i = (y * size + x) * 4
            acc[vid][0] += pixels[i]
            acc[vid][1] += pixels[i + 1]
            acc[vid][2] += pixels[i + 2]
            acc[vid][3] += 1
    colors = {vid: (r / n, g / n, b / n) for vid, (r, g, b, n) in acc.items() if n}
    bpy.data.images.remove(work)
    return colors, img


def band(pts):
    if not pts:
        return {}
    xs, ys, zs = zip(*[(p.x, p.y, p.z) for p in pts])
    return {
        "n": len(pts),
        "x": [min(xs), max(xs)],
        "y": [min(ys), max(ys)],
        "z": [min(zs), max(zs)],
        "z_med": sorted(zs)[len(zs) // 2],
    }


def inspect_blend(path: Path, kind: str) -> dict:
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False)
    obj = mesh_obj()
    images = [
        {
            "name": img.name,
            "size": list(img.size),
            "packed": bool(img.packed_file),
            "filepath": img.filepath,
        }
        for img in bpy.data.images
        if img.size[0] > 0
    ]
    mats = [mat.name for mat in bpy.data.materials]
    colors, img = sample_colors(obj)
    mw = obj.matrix_world
    verts = obj.data.vertices
    report = {
        "blend": str(path.relative_to(REPO)),
        "object": obj.name,
        "verts": len(verts),
        "faces": len(obj.data.polygons),
        "has_uv": bool(obj.data.uv_layers),
        "images": images,
        "materials": mats,
        "color_samples": len(colors),
        "texture": None if img is None else {"name": img.name, "size": list(img.size)},
    }
    if kind == "pip":
        crest, teal_pts, body = [], [], []
        for vid, col in colors.items():
            w = mw @ verts[vid].co
            if coral(col) and w.z >= 1.55:
                crest.append(w)
            if teal(col):
                teal_pts.append(w)
            if 0.55 < col[0] < 0.95 and 0.50 < col[1] < 0.90 and col[2] < 0.45:
                body.append(col)
        tips = sorted(crest, key=lambda p: p.z, reverse=True)[:12]
        report["crest"] = band(crest)
        report["crest_high"] = [[round(p.x, 4), round(p.y, 4), round(p.z, 4)] for p in tips]
        report["teal"] = band(teal_pts)
        if body:
            report["body_mean_rgb"] = [
                sum(c[i] for c in body) / len(body) for i in range(3)
            ]
    else:
        orange, cinn, back, eye_left = [], [], [], []
        for vid, col in colors.items():
            w = mw @ verts[vid].co
            if orange_cloth(col):
                orange.append(w)
            if cinnamon(col):
                cinn.append(w)
                if w.y > 0.05 and w.z > 2.20:
                    eye_left.append(col)
            if w.x < -0.05 and 1.70 < w.z < 2.55 and abs(w.y) < 0.22:
                back.append((w, col))
        report["orange_scarf"] = band(orange)
        report["cinnamon"] = band(cinn)
        if eye_left:
            report["left_eye_cinnamon_mean"] = [
                sum(c[i] for c in eye_left) / len(eye_left) for i in range(3)
            ]
        if back:
            report["upper_back_mean_rgb"] = [
                sum(c[i] for _, c in back) / len(back) for i in range(3)
            ]
            report["upper_back_n"] = len(back)
            report["upper_back_z"] = [
                min(p.z for p, _ in back),
                max(p.z for p, _ in back),
            ]
    return report


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    report = {
        "pip": inspect_blend(WORKING / "pip_highdetail_working.blend", "pip"),
        "goat": inspect_blend(WORKING / "goat_highdetail_working.blend", "goat"),
    }
    dest = OUT / "FOUNDATION_INSPECT.json"
    dest.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"ok": True, "wrote": str(dest.relative_to(REPO))}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
