#!/usr/bin/env python3
"""Inspect and render the Pip long-wing comparison candidate only.

Does not overwrite current Pip. Does not write production-library/.
Does not retopo, rig, merge, or declare canon.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/inspect_pip_long_wing_candidate.py
"""
from __future__ import annotations

import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "assets"))

from build_final_character_production import (  # noqa: E402
    CHAR_LEFT,
    FACING,
    PIP_HEIGHT,
    add_camera,
    apply_object,
    bounds,
    meshes,
    render_path,
    save_blend,
    snap_and_scale,
)
from polish_final_character_finish import feature_lights  # noqa: E402
from theatrical_rebuild_common import assert_not_production_library  # noqa: E402

GLB = (
    REPO
    / "theatrical-foundation/proposed/final-character-production/source-candidates/pip-long-wing"
    / "pip_long_wing_candidate_github.glb"
)
CURRENT = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution/pip_highres_candidate.blend"
OUT_BLEND = (
    REPO
    / "theatrical-foundation/proposed/final-character-production/source-candidates/pip-long-wing"
    / "pip_long_wing_candidate_preview.blend"
)
PREVIEWS = REPO / "artifacts/theatrical-v2/final-character-production/long-wing-candidate"
REPORTS = REPO / "theatrical-foundation/proposed/final-character-production/reports"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def teal(c):
    r, g, b = c
    return b > 0.18 and g > 0.22 and g > r + 0.08 and b > r + 0.05 and r < 0.40


def coral(c):
    r, g, b = c
    return r > 0.50 and 0.12 < g < 0.58 and b < 0.32 and r > g + 0.12


def cinnamon(c):
    r, g, b = c
    return r > 0.35 and 0.12 < g < 0.48 and b < 0.24 and r > g + 0.08


def yellow(c):
    r, g, b = c
    if teal(c) or coral(c) or cinnamon(c):
        return False
    return r + g > 0.45 and b < 0.46 and g > 0.26


def sample_colors(obj, size=192):
    img = next((i for i in bpy.data.images if i.size[0] > 64 and "normal" not in i.name.lower()), None)
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
    return colors, img.name


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


def nonmanifold(obj) -> int:
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.edges.ensure_lookup_table()
    count = sum(1 for edge in bm.edges if not edge.is_manifold)
    bm.free()
    return count


def shoot(name, loc, focus, ortho, dest, samples=24):
    cam = add_camera(name, loc, focus, ortho)
    bpy.context.scene.camera = cam
    render_path(dest, samples=samples)
    return str(dest.relative_to(REPO))


def analyze(obj, colors, height) -> dict:
    mw = obj.matrix_world
    verts = obj.data.vertices
    wings = {"left": [], "right": []}
    eyes = {"left": [], "right": []}
    crest = []
    strap_back = []
    strap_front = []
    bag = []
    for vid, col in colors.items():
        w = mw @ verts[vid].co
        if teal(col):
            if w.x < 0.02 and 0.55 < w.z < 1.70:
                strap_back.append(w)
            if w.x > -0.02:
                strap_front.append(w)
            if w.z < 0.85 and w.y > 0.05:
                bag.append(w)
        if coral(col) and w.z > height * 0.78:
            crest.append(w)
        if yellow(col) and abs(w.y) > 0.16 and 0.18 < w.z < 1.35 and w.x > -0.22:
            wings["left" if w.y >= 0 else "right"].append(w)
        r, g, b = col
        if 1.45 < w.z < 1.90 and w.x > 0.08 and 0.03 < abs(w.y) < 0.28:
            dark_or_green = (r + g + b) < 1.20 and g >= r - 0.06 and not teal(col) and not coral(col)
            if dark_or_green:
                eyes["left" if w.y >= 0 else "right"].append(w)

    wing_meas = {side: ext(pts) for side, pts in wings.items()}
    eye_meas = {side: ext(pts) for side, pts in eyes.items()}
    strap_back_m = ext(strap_back)
    strap_front_m = ext(strap_front)
    bag_m = ext(bag)
    continuous = False
    laterality = "unknown"
    if strap_back_m:
        # Character-right shoulder is -Y; bag on character-left hip is +Y.
        high = [p for p in strap_back if p.z >= (strap_back_m["z"][0] + strap_back_m["z"][1]) * 0.55]
        low = [p for p in strap_back if p.z <= (strap_back_m["z"][0] + strap_back_m["z"][1]) * 0.45]
        if high and low:
            high_y = sum(p.y for p in high) / len(high)
            low_y = sum(p.y for p in low) / len(low)
            laterality = "strap_over_character_right" if high_y < 0 and low_y > 0 else "not_sheet_laterality"
            continuous = (strap_back_m["span_z"] > 0.28) and (high_y * low_y < 0)
    return {
        "wings": wing_meas,
        "eyes": eye_meas,
        "crest": ext(crest),
        "strap_back": strap_back_m,
        "strap_front": strap_front_m,
        "bag": bag_m,
        "strap_continuous_across_back": continuous,
        "strap_laterality": laterality,
    }


def render_turn(stem: str, dest_dir: Path) -> list[str]:
    feature_lights()
    mn, mx = bounds()
    center = (mn + mx) * 0.5
    height = max(mx.z - mn.z, 0.001)
    radius = max(mx.x - mn.x, mx.y - mn.y, height) * 1.45
    face = Vector((0.22, 0.0, height * 0.78))
    written = [
        shoot("front", center + FACING * radius, center + Vector((0, 0, 0.02)), height * 1.28, dest_dir / f"{stem}_front.png"),
        shoot("rear", center - FACING * radius, center + Vector((0, 0, 0.02)), height * 1.28, dest_dir / f"{stem}_rear.png"),
        shoot("side", center + CHAR_LEFT * radius, center + Vector((0, 0, 0.02)), height * 1.28, dest_dir / f"{stem}_side.png"),
        shoot(
            "front_3q",
            center + (FACING * 0.72 + CHAR_LEFT * 0.72) * radius,
            center + Vector((0, 0, 0.02)),
            height * 1.32,
            dest_dir / f"{stem}_front_three_quarter.png",
        ),
        shoot(
            "rear_3q",
            center + (-FACING * 0.72 + CHAR_LEFT * 0.72) * radius,
            center + Vector((0, 0, 0.02)),
            height * 1.32,
            dest_dir / f"{stem}_rear_three_quarter.png",
        ),
        shoot("face", face + FACING * 0.55, face, height * 0.42, dest_dir / f"{stem}_face_closeup.png"),
        shoot(
            "strap_rear",
            Vector((-height * 0.85, 0.0, height * 0.62)),
            Vector((0.0, 0.0, height * 0.62)),
            height * 0.72,
            dest_dir / f"{stem}_strap_rear_closeup.png",
        ),
    ]
    return written


def import_glb() -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(GLB))
    found = meshes()
    extras = []
    for obj in found:
        extras.append({
            "name": obj.name,
            "verts": len(obj.data.vertices),
            "faces": len(obj.data.polygons),
            "materials": [s.material.name for s in obj.material_slots if s.material],
        })
        obj.name = obj.name if "Pip" in obj.name else "Pip_LongWingCandidate"
    mn, mx = bounds()
    return {
        "opened": True,
        "objects": extras,
        "native_min": list(mn),
        "native_max": list(mx),
        "native_height": mx.z - mn.z,
        "native_span_xy": [mx.x - mn.x, mx.y - mn.y],
        "images": [{"name": img.name, "size": list(img.size)} for img in bpy.data.images if img.size[0] > 4],
        "armatures": [obj.name for obj in bpy.data.objects if obj.type == "ARMATURE"],
        "shape_keys": [obj.name for obj in found if obj.data.shape_keys],
    }


def main() -> int:
    assert_not_production_library(OUT_BLEND)
    assert_not_production_library(CURRENT)
    if not GLB.exists():
        raise FileNotFoundError(GLB)
    opened = import_glb()
    obj = meshes()[0]
    opened["nonmanifold"] = nonmanifold(obj)
    opened["sha256"] = sha256(GLB)
    opened["bytes"] = GLB.stat().st_size
    native_colors, img_name = sample_colors(obj)
    opened["color_image"] = img_name
    opened["native_landmarks"] = analyze(obj, native_colors, opened["native_height"])
    scaled = snap_and_scale(PIP_HEIGHT)
    bpy.context.view_layer.update()
    obj = meshes()[0]
    colors, _ = sample_colors(obj)
    landmarks = analyze(obj, colors, scaled["to_height"])
    save_blend(OUT_BLEND)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    renders = render_turn("pip_long_wing", PREVIEWS)
    report = {
        "role": "comparison_candidate_only",
        "current_pip_overwritten": False,
        "production_library_touched": False,
        "canonical_mutated": False,
        "theatrical_bound": False,
        "merge": False,
        "paid_resources": False,
        "blender": "4.2.3 LTS",
        "glb": str(GLB.relative_to(REPO)),
        "preview_blend": str(OUT_BLEND.relative_to(REPO)),
        "opened": opened,
        "scaled": scaled,
        "landmarks_at_2_05": landmarks,
        "renders": renders,
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "PIP_LONG_WING_CANDIDATE.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "opened": opened["opened"],
        "objects": opened["objects"],
        "native_height": opened["native_height"],
        "scaled_height": scaled["to_height"],
        "verts": scaled["verts"],
        "wings": landmarks["wings"],
        "strap": {
            "continuous": landmarks["strap_continuous_across_back"],
            "laterality": landmarks["strap_laterality"],
            "back": landmarks["strap_back"],
            "bag": landmarks["bag"],
        },
        "eyes": landmarks["eyes"],
        "crest_n": landmarks["crest"].get("n"),
        "renders": renders,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
