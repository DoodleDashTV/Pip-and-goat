#!/usr/bin/env python3
"""Restore Goat Color and paint a visible rounded-crown teardrop.

Does not touch corneas, Pip, or front/pair renders.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/repaint_goat_teardrop_organic.py
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "assets"))

from build_final_character_production import CHAR_LEFT, FACING, bounds, save_blend  # noqa: E402
from correct_targeted_characters import color_image, copy_original_goat_color, mesh_obj, shoot  # noqa: E402
from polish_final_character_finish import feature_lights  # noqa: E402
from refine_v2_overnight import raster_tri  # noqa: E402
from theatrical_rebuild_common import assert_not_production_library  # noqa: E402

HIRES = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution"
CORR = REPO / "artifacts/theatrical-v2/final-character-production/corrections"
TEXTURES = REPO / "theatrical-foundation/proposed/final-character-production/textures"
REPORTS = REPO / "theatrical-foundation/proposed/final-character-production/reports"
CINNAMON = (0.55, 0.26, 0.11)


def paint(obj, img) -> dict:
    import numpy as np

    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape((h, w, 4))
    uv = obj.data.uv_layers.active.data
    mw = obj.matrix_world
    top = 1.88
    bot = 1.30
    cin = np.array([*CINNAMON, 1.0], dtype=np.float32)
    filled = 0

    def alpha(world: Vector) -> float:
        if world.x > -0.015:
            return 0.0
        t = (top - world.z) / (top - bot)
        if t < -0.10 or t > 1.08:
            return 0.0
        # Rounded crown just below the scarf, peak in the upper third,
        # then a long soft point. No hard z-cut, no tail bar.
        if t < 0.0:
            vert = max(0.0, 1.0 + t / 0.10) ** 2 * 0.30
        elif t > 1.0:
            vert = max(0.0, 1.0 - (t - 1.0) / 0.08) ** 2 * 0.18
        else:
            rise = min(1.0, t / 0.28)
            rise = rise * rise * (3.0 - 2.0 * rise)
            taper = (1.0 - t) ** 0.92
            vert = rise * (0.35 + 0.65 * taper)
        if vert <= 0.0:
            return 0.0
        wiggle = 0.09 * math.sin(world.z * 12.5) * math.cos(world.y * 9.0 + 0.6)
        width = 0.205 * (0.28 + 0.72 * vert) * (1.0 + wiggle)
        ay = abs(world.y)
        if ay > width:
            return 0.0
        radial = ay / max(width, 1e-4)
        edge = 0.5 + 0.5 * math.cos(min(1.0, radial) * math.pi)
        return float(max(0.0, min(0.78, vert * edge * 0.95)))

    for poly in obj.data.polygons:
        loops = list(poly.loop_indices)
        worlds = [mw @ obj.data.vertices[obj.data.loops[li].vertex_index].co for li in loops]
        alphas = [alpha(world) for world in worlds]
        if max(alphas) < 0.03:
            continue
        pts = [(float(uv[li].uv.x) * (w - 1), float(uv[li].uv.y) * (h - 1)) for li in loops]
        for i in range(1, len(pts) - 1):
            filled += raster_tri(
                px,
                [pts[0], pts[i], pts[i + 1]],
                [alphas[0], alphas[i], alphas[i + 1]],
                cin,
                0.76,
            )
    img.pixels.foreach_set(px.reshape(-1))
    img.update()
    dest = TEXTURES / "goat_highres_basecolor.png"
    img.file_format = "PNG"
    img.filepath_raw = str(dest)
    img.save()
    if img.packed_file:
        img.unpack(method="REMOVE")
    img.filepath = "//../textures/goat_highres_basecolor.png"
    return {"top": top, "bot": bot, "filled": filled, "no_tail_bar": True, "no_hard_z_cut": True}


def main() -> int:
    path = HIRES / "goat_highres_candidate.blend"
    assert_not_production_library(path)
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False)
    goat = mesh_obj("Goat")
    img = color_image()
    restore = copy_original_goat_color(img)
    back = paint(goat, img)
    save_blend(path)
    feature_lights()
    mn, mx = bounds()
    center = (mn + mx) * 0.5
    height = mx.z - mn.z
    renders = [
        shoot("goat_rear", center - FACING * height * 1.45, center + Vector((0, 0, 0.02)), height * 1.28, CORR / "02_goat_corrected_rear.png"),
        shoot(
            "goat_rear_3q",
            center + (-FACING * 0.72 + CHAR_LEFT * 0.72) * height * 1.25,
            center + Vector((0, 0, 0.02)),
            height * 1.32,
            CORR / "03_goat_corrected_rear_three_quarter.png",
        ),
    ]
    report = {"restore": restore, "back": back, "renders": renders, "paid_resources": False}
    (REPORTS / "TARGETED_BACK_TEARDROP.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
