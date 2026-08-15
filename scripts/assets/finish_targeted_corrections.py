#!/usr/bin/env python3
"""Finish the targeted correction pass.

- Hide Goat cornea spheres from render (objects stay in the file).
- Restore the original Color map, then paint a rounded-crown organic
  upper-back marking with no hard z-cut and no tail bar.
- Re-render Goat front close-up, rear, rear 3/4, and the pair.

Does not edit Pip mesh. Does not delete corneas. Does not retopo/rig.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/finish_targeted_corrections.py
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

from build_final_character_production import CHAR_LEFT, FACING, append_blend, bounds, save_blend  # noqa: E402
from correct_targeted_characters import color_image, copy_original_goat_color, mesh_obj, sample_colors, shoot  # noqa: E402
from polish_final_character_finish import feature_lights  # noqa: E402
from refine_v2_overnight import raster_tri  # noqa: E402
from theatrical_rebuild_common import assert_not_production_library  # noqa: E402

HIRES = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution"
CORR = REPO / "artifacts/theatrical-v2/final-character-production/corrections"
TEXTURES = REPO / "theatrical-foundation/proposed/final-character-production/textures"
REPORTS = REPO / "theatrical-foundation/proposed/final-character-production/reports"
CINNAMON = (0.54, 0.27, 0.12)
OATMEAL = (0.80, 0.72, 0.58)


def hide_corneas() -> dict:
    hidden = []
    leftover_catch = []
    for obj in list(bpy.data.objects):
        if obj.name.startswith("Goat_Cornea"):
            obj.hide_render = True
            obj.hide_viewport = True
            hidden.append({
                "name": obj.name,
                "location": list(obj.location),
                "hide_render": True,
                "deleted": False,
            })
        elif "Catch" in obj.name:
            leftover_catch.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    return {
        "hidden_from_render_not_deleted": hidden,
        "leftover_catch_removed": leftover_catch,
    }


def paint_rounded_crown(obj, img) -> dict:
    """Organic teardrop: rounded crown, soft sides, point down, no tail bar."""
    import numpy as np

    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape((h, w, 4))
    uv = obj.data.uv_layers.active.data
    mw = obj.matrix_world
    top = 1.86
    bot = 1.34
    cin = np.array([*CINNAMON, 1.0], dtype=np.float32)
    filled = 0

    def alpha(world: Vector) -> float:
        if world.x > -0.02:
            return 0.0
        # Soft vertical envelope. t=0 at crown, t=1 at tip. Allow a fade
        # into the scarf and past the tip so there is no hard z-cut.
        span = top - bot
        t = (top - world.z) / span
        if t < -0.14 or t > 1.10:
            return 0.0
        if t < 0.0:
            rise = 1.0 - (t / -0.14)
            vert = max(0.0, rise) ** 2 * 0.38
        elif t > 1.0:
            fall = 1.0 - ((t - 1.0) / 0.10)
            vert = max(0.0, fall) ** 2 * 0.22
        else:
            # Smoothstep rise to a rounded crown, then a long taper.
            rise = min(1.0, t / 0.22)
            rise = rise * rise * (3.0 - 2.0 * rise)
            taper = (1.0 - t) ** 1.08
            vert = rise * taper
        if vert <= 0.0:
            return 0.0
        wiggle = 0.11 * math.sin(world.z * 13.0 + 0.4) * math.cos(world.y * 8.5 + world.z * 2.2)
        width = 0.195 * (0.42 + 0.58 * vert) * (1.0 + wiggle)
        ay = abs(world.y)
        if ay > width:
            return 0.0
        radial = ay / max(width, 1e-4)
        edge = 0.5 + 0.5 * math.cos(min(1.0, radial) * math.pi)
        return float(max(0.0, min(0.70, vert * edge * 0.88)))

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
                0.68,
            )
    img.pixels.foreach_set(px.reshape(-1))
    img.update()
    dest = TEXTURES / "goat_highres_basecolor.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.file_format = "PNG"
    img.filepath_raw = str(dest)
    img.save()
    if img.packed_file:
        img.unpack(method="REMOVE")
    img.filepath = "//../textures/goat_highres_basecolor.png"
    return {
        "cause": (
            "Stage-2 Color stamp used a hard z-cut teardrop (widest at the "
            "flat top) plus a separate vertical tail-base bar at z 0.92-1.16, "
            "width 0.065. UV rasterization read as a brown rectangle."
        ),
        "fix": (
            "Restored original working Color map, then painted a rounded-crown "
            "organic teardrop with cosine sides, sine irregularity, soft scarf "
            "fade, and no tail bar."
        ),
        "top": top,
        "bot": bot,
        "filled": filled,
        "no_tail_bar": True,
        "no_hard_z_cut": True,
    }


def main() -> int:
    path = HIRES / "goat_highres_candidate.blend"
    assert_not_production_library(path)
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False)
    cornea = hide_corneas()
    goat = mesh_obj("Goat")
    img = color_image()
    restore = copy_original_goat_color(img)
    colors = sample_colors(goat, img)
    back = paint_rounded_crown(goat, img)
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
            if obj.name.startswith("Goat_Cornea") or "Catch" in obj.name:
                obj.hide_render = True
                obj.hide_viewport = True
    bpy.context.view_layer.update()
    feature_lights()
    both = [o for o in bpy.data.objects if o.type == "MESH"]
    mn, mx = bounds(both)
    center = (mn + mx) * 0.5
    height = mx.z - mn.z
    span = max(mx.x - mn.x, mx.y - mn.y, height)
    pair = shoot(
        "pair",
        center + FACING * span * 1.35,
        center + Vector((0, 0, 0.02)),
        max(span * 1.15, height * 1.72),
        CORR / "08_corrected_pair.png",
        samples=24,
    )
    report = {
        "cornea": cornea,
        "color_restore": restore,
        "back": back,
        "renders": renders + [pair],
        "paid_resources": False,
        "pip_mesh_edited": False,
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "TARGETED_CORNEA_HIDDEN.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
