#!/usr/bin/env python3
"""Restore high-res candidates from working blends; paint Goat back teardrop only.

Pip is restored unchanged (crest vertex shrink stays reverted).
Goat Color is painted, then saved as its own external PNG. Normal/ORM stay packed.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/restore_and_paint_goat_teardrop.py
"""
from __future__ import annotations

import json
import shutil
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "assets"))

from build_final_character_production import (  # noqa: E402
    append_blend,
    bounds,
    render_pair,
    render_subject,
    save_blend,
)
from refine_v2_overnight import raster_tri  # noqa: E402
from theatrical_rebuild_common import assert_not_production_library  # noqa: E402

WORKING = REPO / "theatrical-foundation/proposed/final-character-production/working"
HIRES = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution"
TEXTURES = REPO / "theatrical-foundation/proposed/final-character-production/textures"
REPORTS = REPO / "theatrical-foundation/proposed/final-character-production/reports"

CINNAMON = (0.58, 0.24, 0.10)


def orange_cloth(c):
    r, g, b = c
    return r > 0.50 and 0.12 < g < 0.48 and b < 0.22 and r > g + 0.18


def cinnamon(c):
    r, g, b = c
    return r > 0.32 and r > g + 0.08 and b < 0.22 and g < 0.42


def mesh_obj():
    found = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    if not found:
        raise RuntimeError("no mesh")
    return found[0]


def color_image():
    for img in bpy.data.images:
        if img.size[0] > 64 and "color" in img.name.lower() and "normal" not in img.name.lower():
            return img
    images = [img for img in bpy.data.images if img.size[0] > 64]
    return max(images, key=lambda img: img.size[0] * img.size[1]) if images else None


def sample_colors(obj, img, size=256):
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
    return colors


def scarf_bottom(obj, colors) -> float:
    mw = obj.matrix_world
    zs = []
    for vid, col in colors.items():
        world = mw @ obj.data.vertices[vid].co
        if orange_cloth(col) and world.x < 0.18 and 1.85 < world.z < 2.70:
            zs.append(world.z)
    if not zs:
        return 2.28
    zs.sort()
    return zs[int(len(zs) * 0.18)]


def sample_cinnamon_rgb(obj, colors):
    mw = obj.matrix_world
    samples = []
    for vid, col in colors.items():
        world = mw @ obj.data.vertices[vid].co
        if cinnamon(col) and world.y > 0.04 and world.z > 2.15:
            samples.append(col)
    if not samples:
        return CINNAMON
    # Push sampled oatmeal-adjacent cinnamon toward the saturated sheet color.
    mean = tuple(sum(c[i] for c in samples) / len(samples) for i in range(3))
    return tuple(mean[i] * 0.35 + CINNAMON[i] * 0.65 for i in range(3))


def paint_goat_teardrop(obj, img, colors) -> dict:
    import numpy as np

    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape((h, w, 4))
    uv = obj.data.uv_layers.active.data
    mw = obj.matrix_world
    top = scarf_bottom(obj, colors) - 0.02
    bot = top - 0.72
    rgb = sample_cinnamon_rgb(obj, colors)
    color = np.array([rgb[0], rgb[1], rgb[2], 1.0], dtype=np.float32)
    filled = 0
    tris = 0

    def alpha(world: Vector) -> float:
        if world.x > -0.03:
            return 0.0
        if bot <= world.z <= top:
            t = (top - world.z) / max(top - bot, 1e-4)
            width = 0.36 * ((1.0 - t) ** 0.50) * (0.62 + 0.38 * (1.0 - t))
            ay = abs(world.y)
            if ay <= width:
                edge = 1.0 - (ay / max(width, 1e-4)) ** 1.35
                return max(0.0, min(1.0, edge * (0.96 - 0.12 * t)))
        if 0.92 <= world.z <= 1.16 and abs(world.y) <= 0.065 and world.x < -0.10:
            return 0.50
        return 0.0

    for poly in obj.data.polygons:
        loops = list(poly.loop_indices)
        worlds = [mw @ obj.data.vertices[obj.data.loops[li].vertex_index].co for li in loops]
        alphas = [alpha(world) for world in worlds]
        if max(alphas) < 0.04:
            continue
        pts = [(float(uv[li].uv.x) * (w - 1), float(uv[li].uv.y) * (h - 1)) for li in loops]
        for i in range(1, len(pts) - 1):
            filled += raster_tri(
                px,
                [pts[0], pts[i], pts[i + 1]],
                [alphas[0], alphas[i], alphas[i + 1]],
                color,
                0.92,
            )
            tris += 1
    img.pixels.foreach_set(px.reshape(-1))
    img.update()
    return {
        "top": top,
        "bot": bot,
        "filled_px": filled,
        "tris": tris,
        "cinnamon_rgb": list(rgb),
        "image": img.name,
        "size": [w, h],
    }


def export_color_only(img, dest: Path) -> str:
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.file_format = "PNG"
    img.filepath_raw = str(dest)
    img.save()
    if img.packed_file:
        img.unpack(method="REMOVE")
    img.filepath = f"//../textures/{dest.name}"
    img.filepath_raw = img.filepath
    return str(dest.relative_to(REPO))


def main() -> int:
    HIRES.mkdir(parents=True, exist_ok=True)
    TEXTURES.mkdir(parents=True, exist_ok=True)
    pip_src = WORKING / "pip_highdetail_working.blend"
    goat_src = WORKING / "goat_highdetail_working.blend"
    pip_dest = HIRES / "pip_highres_candidate.blend"
    goat_dest = HIRES / "goat_highres_candidate.blend"
    shutil.copy2(pip_src, pip_dest)
    shutil.copy2(goat_src, goat_dest)

    assert_not_production_library(goat_dest)
    bpy.ops.wm.open_mainfile(filepath=str(goat_dest), load_ui=False)
    obj = mesh_obj()
    img = color_image()
    if img is None:
        raise RuntimeError("goat color image missing")
    colors = sample_colors(obj, img)
    notes = paint_goat_teardrop(obj, img, colors)
    tex = export_color_only(img, TEXTURES / "goat_highres_basecolor.png")
    save_blend(goat_dest)
    goat_renders = render_subject("goat_final")
    pair = render_pair(pip_dest, goat_dest)

    report = {
        "pip_restored_from_working": True,
        "goat_teardrop": notes,
        "goat_color": tex,
        "goat_blend_bytes": goat_dest.stat().st_size,
        "pip_blend_bytes": pip_dest.stat().st_size,
        "pair": pair,
        "goat_renders": goat_renders,
        "paid_resources": False,
        "canonical_mutated": False,
        "primitive_rebuild_used": False,
    }
    (REPORTS / "STAGE2_GOAT_TEARDROP.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "ok": True,
        "goat_bytes": goat_dest.stat().st_size,
        "pip_bytes": pip_dest.stat().st_size,
        "ratio": pair["ratio"],
        "teardrop": notes,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
