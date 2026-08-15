#!/usr/bin/env python3
"""Inspect Goat extras and Pip eye/wing landmarks. No edits."""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
HIRES = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution"
OUT = REPO / "theatrical-foundation/proposed/final-character-production/reports"


def mesh_objs():
    return [obj for obj in bpy.data.objects if obj.type == "MESH"]


def world_bounds(obj):
    coords = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    xs, ys, zs = zip(*[(c.x, c.y, c.z) for c in coords])
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def inspect_goat() -> dict:
    bpy.ops.wm.open_mainfile(filepath=str(HIRES / "goat_highres_candidate.blend"), load_ui=False)
    objects = []
    for obj in bpy.data.objects:
        mn, mx = (world_bounds(obj) if obj.type == "MESH" else (Vector(), Vector()))
        objects.append({
            "name": obj.name,
            "type": obj.type,
            "location": list(obj.location),
            "dims": list(mx - mn) if obj.type == "MESH" else None,
            "center": list((mn + mx) * 0.5) if obj.type == "MESH" else None,
            "materials": [slot.material.name for slot in obj.material_slots if slot.material],
        })
    extras = [row for row in objects if row["name"] != "Goat_HighDetail" and row["type"] == "MESH"]
    return {"objects": objects, "extras": extras}


def sample_colors(obj, size=192):
    img = next((i for i in bpy.data.images if i.size[0] > 64 and "color" in i.name.lower() and "normal" not in i.name.lower()), None)
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


def inspect_pip() -> dict:
    bpy.ops.wm.open_mainfile(filepath=str(HIRES / "pip_highres_candidate.blend"), load_ui=False)
    obj = next(o for o in mesh_objs() if "Pip" in o.name or o.type == "MESH")
    extras = [o.name for o in mesh_objs() if o != obj]
    colors, _ = sample_colors(obj)
    mw = obj.matrix_world
    mn, mx = world_bounds(obj)
    height = mx.z - mn.z
    eyes = {"left": [], "right": []}
    wings = {"left": [], "right": []}
    for vid, col in colors.items():
        r, g, b = col
        w = mw @ obj.data.vertices[vid].co
        if g > 0.14 and g > r + 0.02 and r < 0.42 and b < 0.32 and w.z > height * 0.66 and w.x > 0.02:
            side = "left" if w.y >= 0 else "right"
            eyes[side].append(w)
        teal = b > 0.18 and g > 0.22 and g > r + 0.08 and r < 0.35
        cinnamon = r > 0.35 and r > g + 0.08 and b < 0.22 and g < 0.45
        if (not teal) and (not cinnamon) and abs(w.y) > 0.18 and 0.28 < w.z < 1.35:
            side = "left" if w.y >= 0 else "right"
            wings[side].append(w)

    def ext(pts):
        if not pts:
            return {}
        xs, ys, zs = zip(*[(p.x, p.y, p.z) for p in pts])
        return {
            "n": len(pts),
            "center": [sum(xs) / len(xs), sum(ys) / len(ys), sum(zs) / len(zs)],
            "x": [min(xs), max(xs)],
            "y": [min(ys), max(ys)],
            "z": [min(zs), max(zs)],
            "span_y": max(ys) - min(ys),
            "span_z": max(zs) - min(zs),
            "span_x": max(xs) - min(xs),
        }

    return {
        "object": obj.name,
        "extras": extras,
        "height": height,
        "eyes": {k: ext(v) for k, v in eyes.items()},
        "wings": {k: ext(v) for k, v in wings.items()},
    }


def main() -> int:
    report = {"goat": inspect_goat(), "pip": inspect_pip()}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "TARGETED_INSPECT.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "goat_extras": report["goat"]["extras"],
        "pip_eyes": report["pip"]["eyes"],
        "pip_wings": report["pip"]["wings"],
        "pip_height": report["pip"]["height"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
