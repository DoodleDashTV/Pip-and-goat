#!/usr/bin/env python3
"""Make remaining Goat corneas optically clear; soften back mark edges.

Does not delete cornea objects. Does not touch Pip.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "assets"))

from build_final_character_production import FACING, CHAR_LEFT, add_camera, append_blend, bounds, render_path, save_blend  # noqa: E402
from correct_targeted_characters import color_image, mesh_obj, sample_colors, shoot  # noqa: E402
from polish_final_character_finish import feature_lights  # noqa: E402
from refine_v2_overnight import raster_tri  # noqa: E402
from theatrical_rebuild_common import assert_not_production_library  # noqa: E402

HIRES = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution"
CORR = REPO / "artifacts/theatrical-v2/final-character-production/corrections"
TEXTURES = REPO / "theatrical-foundation/proposed/final-character-production/textures"
REPORTS = REPO / "theatrical-foundation/proposed/final-character-production/reports"
CINNAMON = (0.54, 0.28, 0.13)
OATMEAL = (0.80, 0.72, 0.58)


def clear_cornea_material():
    mat = bpy.data.materials.get("Goat_Cornea")
    if mat is None or not mat.use_nodes:
        return {"cleared": False}
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return {"cleared": False}
    bsdf.inputs["Base Color"].default_value = (0.98, 0.99, 1.0, 1.0)
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = 0.92
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.03
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.55
    if "Coat Roughness" in bsdf.inputs:
        bsdf.inputs["Coat Roughness"].default_value = 0.04
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = 0.18
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.85
    mat.blend_method = "BLEND"
    if hasattr(mat, "shadow_method"):
        mat.shadow_method = "NONE"
    # Hide leftover catch objects if any.
    removed = []
    for obj in list(bpy.data.objects):
        if "Catch" in obj.name:
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    return {"cleared": True, "alpha": 0.18, "transmission": 0.92, "catch_removed": removed}


def soften_back(obj, img, colors):
    import numpy as np

    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape((h, w, 4))
    uv = obj.data.uv_layers.active.data
    mw = obj.matrix_world
    oat = np.array([*OATMEAL, 1.0], dtype=np.float32)
    cin = np.array([*CINNAMON, 1.0], dtype=np.float32)
    # Soften any remaining hard cinnamon on the back by mixing toward oatmeal
    # at the outer band, then restamp a narrower organic teardrop.
    filled = 0

    def fade(world: Vector) -> float:
        if world.x > -0.01 or not (1.20 < world.z < 1.95):
            return 0.0
        t = (1.90 - world.z) / 0.70
        width = 0.28
        ay = abs(world.y)
        if ay > width:
            return 0.55
        radial = ay / width
        return float(0.15 + 0.45 * radial)

    def stamp(world: Vector) -> float:
        if world.x > -0.03 or not (1.34 < world.z < 1.86):
            return 0.0
        t = (1.86 - world.z) / 0.52
        width = 0.165 * ((1.0 - t) ** 0.85) * (0.82 + 0.18 * (1.0 - t))
        ay = abs(world.y)
        if ay > width:
            return 0.0
        radial = ay / max(width, 1e-4)
        edge = 0.5 + 0.5 * np.cos(min(1.0, radial) * np.pi)
        return float(max(0.0, min(0.62, edge * ((1.0 - t) ** 0.45) * 0.80)))

    for poly in obj.data.polygons:
        loops = list(poly.loop_indices)
        worlds = [mw @ obj.data.vertices[obj.data.loops[li].vertex_index].co for li in loops]
        fades = [fade(world) for world in worlds]
        stamps = [stamp(world) for world in worlds]
        pts = [(float(uv[li].uv.x) * (w - 1), float(uv[li].uv.y) * (h - 1)) for li in loops]
        if max(fades) > 0.05:
            for i in range(1, len(pts) - 1):
                filled += raster_tri(px, [pts[0], pts[i], pts[i + 1]], [fades[0], fades[i], fades[i + 1]], oat, 0.55)
        if max(stamps) > 0.03:
            for i in range(1, len(pts) - 1):
                filled += raster_tri(px, [pts[0], pts[i], pts[i + 1]], [stamps[0], stamps[i], stamps[i + 1]], cin, 0.70)
    img.pixels.foreach_set(px.reshape(-1))
    img.update()
    dest = TEXTURES / "goat_highres_basecolor.png"
    img.filepath_raw = str(dest)
    img.file_format = "PNG"
    img.save()
    return {"softened": True, "filled": filled}


def main() -> int:
    path = HIRES / "goat_highres_candidate.blend"
    assert_not_production_library(path)
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False)
    cornea = clear_cornea_material()
    goat = mesh_obj("Goat")
    img = color_image()
    colors = sample_colors(goat, img)
    back = soften_back(goat, img, colors)
    save_blend(path)
    feature_lights()
    mn, mx = bounds()
    center = (mn + mx) * 0.5
    height = mx.z - mn.z
    face = Vector((0.30, 0.0, height * 0.76))
    renders = [
        shoot("goat_front_close", face + FACING * 0.55, face, height * 0.40, CORR / "01_goat_corrected_front_closeup.png"),
        shoot("goat_rear", center - FACING * height * 1.45, center + Vector((0, 0, 0.02)), height * 1.28, CORR / "02_goat_corrected_rear.png"),
        shoot(
            "goat_rear_3q",
            center + (-FACING * 0.72 + CHAR_LEFT * 0.72) * height * 1.25,
            center + Vector((0, 0, 0.02)),
            height * 1.32,
            CORR / "03_goat_corrected_rear_three_quarter.png",
        ),
    ]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pips = append_blend(HIRES / "pip_highres_candidate.blend")
    goats = append_blend(path)
    for obj in pips:
        if obj.type == "MESH":
            obj.location.y -= 0.95
    for obj in goats:
        if obj.type == "MESH":
            obj.location.y += 1.15
    bpy.context.view_layer.update()
    feature_lights()
    both = [o for o in bpy.data.objects if o.type == "MESH"]
    mn, mx = bounds(both)
    center = (mn + mx) * 0.5
    height = mx.z - mn.z
    span = max(mx.x - mn.x, mx.y - mn.y, height)
    pair = shoot("pair", center + FACING * span * 1.35, center + Vector((0, 0, 0.02)), max(span * 1.15, height * 1.72), CORR / "08_corrected_pair.png", samples=28)
    report = {"cornea": cornea, "back": back, "renders": renders + [pair], "paid_resources": False}
    (REPORTS / "TARGETED_CORNEA_CLEAR.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
