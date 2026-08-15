#!/usr/bin/env python3
"""Nondestructive Stage 2 refinement of selected Prism foundations.

Works on duplicates of the working blends. Does not overwrite original GLB,
FBX, JPEG, texture, or source .blend files. Does not stretch fused wings
or hard-translate the satchel. Does not use the rejected primitive rebuild.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/refine_final_character_production.py
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
    CHAR_LEFT,
    FACING,
    add_camera,
    append_blend,
    bounds,
    khronos,
    lights,
    meshes,
    render_path,
    save_blend,
)
from refine_v2_overnight import raster_tri  # noqa: E402
from theatrical_rebuild_common import assert_not_production_library  # noqa: E402

WORKING = REPO / "theatrical-foundation/proposed/final-character-production/working"
HIRES = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution"
TEXTURES = REPO / "theatrical-foundation/proposed/final-character-production/textures"
PREVIEWS = REPO / "artifacts/theatrical-v2/final-character-production/clean"
LIGHTS = REPO / "artifacts/theatrical-v2/final-character-production/lighting"
REPORTS = REPO / "theatrical-foundation/proposed/final-character-production/reports"

CINNAMON = (0.58, 0.24, 0.10)
HEAD_YELLOW = (0.78, 0.72, 0.28)


def coral(c):
    r, g, b = c
    return r > 0.55 and 0.12 < g < 0.55 and b < 0.28 and r > g + 0.15


def orange_cloth(c):
    r, g, b = c
    return r > 0.50 and 0.12 < g < 0.48 and b < 0.22 and r > g + 0.18


def cinnamon(c):
    r, g, b = c
    return r > 0.32 and r > g + 0.08 and b < 0.22 and g < 0.42


def mesh_obj():
    found = meshes()
    if not found:
        raise RuntimeError("no mesh")
    return found[0]


def primary_image():
    images = [img for img in bpy.data.images if img.size[0] > 64]
    if not images:
        return None
    return max(images, key=lambda img: img.size[0] * img.size[1])


def sample_colors(obj, img, size=256):
    if img is None or not obj.data.uv_layers:
        return {}
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


def stamp_color(px, uv, loops, color, strength=0.88, rad=7):
    import numpy as np

    h, w = px.shape[:2]
    stamps = 0
    seen = set()
    for li in loops:
        u, v = uv[li].uv
        cx = int(round(float(u) * (w - 1))) % w
        cy = int(round(float(v) * (h - 1))) % h
        key = (cx, cy)
        if key in seen:
            continue
        seen.add(key)
        y0, y1 = max(0, cy - rad), min(h, cy + rad + 1)
        x0, x1 = max(0, cx - rad), min(w, cx + rad + 1)
        yy, xx = np.ogrid[y0:y1, x0:x1]
        dist = ((yy - cy) / max(rad, 1)) ** 2 + ((xx - cx) / max(rad, 1)) ** 2
        mask = dist <= 1.0
        fall = np.clip(1.0 - np.sqrt(np.clip(dist, 0, 1)), 0.0, 1.0)
        region = px[y0:y1, x0:x1]
        alpha = (fall * strength)[..., None]
        region[mask] = region[mask] * (1.0 - alpha[mask]) + color * alpha[mask]
        stamps += 1
    return stamps


def suppress_pip_crest_stubs(obj, img, colors) -> dict:
    import numpy as np

    if img is None or not colors:
        return {"skipped": True, "reason": "no texture/colors"}
    mw = obj.matrix_world
    imw = mw.inverted()
    verts = obj.data.vertices
    crest = []
    for vid, col in colors.items():
        world = mw @ verts[vid].co
        if coral(col) and world.z >= 1.58:
            crest.append((vid, world))
    if len(crest) < 40:
        return {"skipped": True, "count": len(crest)}
    high = [item for item in crest if item[1].z >= 1.82] or crest
    center = max(high, key=lambda item: item[1].z - 0.18 * abs(item[1].y))[1]
    left = max(high, key=lambda item: item[1].y + 0.22 * item[1].z)[1]
    right = max(high, key=lambda item: -item[1].y + 0.22 * item[1].z)[1]
    tips = [center, left, right]
    attach = Vector((center.x * 0.35, 0.0, 1.68))
    stub_ids = set()
    kept = {"center": 0, "left": 0, "right": 0}
    for vid, world in crest:
        dists = [(world - tip).length for tip in tips]
        nearest = min(range(3), key=lambda i: dists[i])
        ordered = sorted(dists)
        on_blade = dists[nearest] < 0.085 and (ordered[1] / max(ordered[0], 1e-4)) > 1.18
        low_stub = world.z < 1.86 and world.x < center.x - 0.02
        between = ordered[1] / max(ordered[0], 1e-4) < 1.16 and world.z < center.z - 0.04
        if on_blade and not low_stub:
            kept[["center", "left", "right"][nearest]] += 1
            continue
        if low_stub or between or (not on_blade and world.z < 1.92):
            stub_ids.add(vid)
    for vid in stub_ids:
        world = mw @ verts[vid].co
        skull = Vector((attach.x, world.y * 0.28, attach.z + 0.02))
        delta = (skull - world) * 0.42
        if delta.length > 0.045:
            delta *= 0.045 / delta.length
        verts[vid].co = imw @ (world + delta)
    obj.data.update()

    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape((h, w, 4))
    uv = obj.data.uv_layers.active.data
    color = np.array([*HEAD_YELLOW, 1.0], dtype=np.float32)
    loops = []
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            if obj.data.loops[li].vertex_index in stub_ids:
                loops.append(li)
    stamps = stamp_color(px, uv, loops, color, strength=0.90, rad=6)
    img.pixels.foreach_set(px.reshape(-1))
    img.update()
    try:
        img.pack()
    except Exception:
        pass
    return {
        "crest_n": len(crest),
        "stub_n": len(stub_ids),
        "kept": kept,
        "tips": {
            "center": list(center),
            "left": list(left),
            "right": list(right),
        },
        "stamps": stamps,
        "image": img.name,
        "size": [w, h],
    }


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


def sample_cinnamon_rgb(obj, colors) -> tuple[float, float, float]:
    mw = obj.matrix_world
    samples = []
    for vid, col in colors.items():
        world = mw @ obj.data.vertices[vid].co
        if cinnamon(col) and world.y > 0.04 and world.z > 2.15:
            samples.append(col)
    if not samples:
        return CINNAMON
    return tuple(sum(c[i] for c in samples) / len(samples) for i in range(3))


def paint_goat_teardrop(obj, img, colors) -> dict:
    import numpy as np

    if img is None:
        return {"skipped": True, "reason": "no texture"}
    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape((h, w, 4))
    uv = obj.data.uv_layers.active.data
    mw = obj.matrix_world
    top = scarf_bottom(obj, colors) - 0.03
    bot = top - 0.78
    rgb = sample_cinnamon_rgb(obj, colors)
    color = np.array([rgb[0], rgb[1], rgb[2], 1.0], dtype=np.float32)
    filled = 0
    tris = 0

    def alpha(world: Vector) -> float:
        if world.x > -0.03:
            return 0.0
        # Upper-back teardrop: rounded just below scarf, point down the spine.
        if bot <= world.z <= top:
            t = (top - world.z) / max(top - bot, 1e-4)
            width = 0.34 * ((1.0 - t) ** 0.42) * (0.55 + 0.45 * (1.0 - t))
            ay = abs(world.y)
            if ay <= width:
                edge = 1.0 - (ay / max(width, 1e-4)) ** 1.55
                return max(0.0, min(1.0, edge * (0.94 - 0.16 * t)))
        # Small tail-base cinnamon, binding rear sheet.
        if 0.92 <= world.z <= 1.18 and abs(world.y) <= 0.07 and world.x < -0.10:
            return 0.55
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
                0.90,
            )
            tris += 1
    img.pixels.foreach_set(px.reshape(-1))
    img.update()
    try:
        img.pack()
    except Exception:
        pass
    return {
        "top": top,
        "bot": bot,
        "filled_px": filled,
        "tris": tris,
        "cinnamon_rgb": list(rgb),
        "image": img.name,
        "size": [w, h],
    }


def export_texture(img, dest: Path):
    if img is None:
        return None
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.filepath_raw = str(dest)
    img.file_format = "PNG"
    img.save()
    return str(dest.relative_to(REPO))


def clear_lights():
    for obj in list(bpy.data.objects):
        if obj.type == "LIGHT":
            bpy.data.objects.remove(obj, do_unlink=True)
    for light in list(bpy.data.lights):
        bpy.data.lights.remove(light)


def apply_light_rig(kind: str):
    khronos()
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("FinalWorld")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes["Background"]
    clear_lights()
    if kind == "neutral":
        bg.inputs["Color"].default_value = (0.83, 0.86, 0.89, 1.0)
        bg.inputs["Strength"].default_value = 0.88
        key_e, fill_e, key_r, fill_r = 2.35, 0.62, (0.70, 0.10, 0.32), (0.95, -0.42, 3.25)
    elif kind == "daylight":
        bg.inputs["Color"].default_value = (0.78, 0.86, 0.94, 1.0)
        bg.inputs["Strength"].default_value = 1.05
        key_e, fill_e, key_r, fill_r = 2.10, 0.85, (0.85, 0.05, 0.55), (1.10, -0.55, 2.80)
    elif kind == "warm_interior":
        bg.inputs["Color"].default_value = (0.92, 0.82, 0.70, 1.0)
        bg.inputs["Strength"].default_value = 0.70
        key_e, fill_e, key_r, fill_r = 2.05, 0.48, (0.95, 0.20, 0.18), (0.70, -0.30, 3.40)
    else:
        bg.inputs["Color"].default_value = (0.18, 0.20, 0.26, 1.0)
        bg.inputs["Strength"].default_value = 0.22
        key_e, fill_e, key_r, fill_r = 3.40, 0.28, (0.55, 0.25, 0.85), (1.20, -0.70, 2.40)
    key = bpy.data.lights.new(f"{kind}_Key", "SUN")
    key.energy = key_e
    key_obj = bpy.data.objects.new(f"{kind}_Key", key)
    scene.collection.objects.link(key_obj)
    key_obj.rotation_euler = key_r
    fill = bpy.data.lights.new(f"{kind}_Fill", "SUN")
    fill.energy = fill_e
    fill_obj = bpy.data.objects.new(f"{kind}_Fill", fill)
    scene.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = fill_r


def render_subject(stem: str, extra_lights: bool = True) -> list[str]:
    apply_light_rig("neutral")
    mn, mx = bounds()
    center = (mn + mx) * 0.5
    height = max(mx.z - mn.z, 0.001)
    radius = max(mx.x - mn.x, mx.y - mn.y, height) * 1.45
    views = {
        "front": (center + FACING * radius, height * 1.28),
        "back": (center - FACING * radius, height * 1.28),
        "side": (center + CHAR_LEFT * radius, height * 1.28),
        "three_quarter": (center + (FACING * 0.72 + CHAR_LEFT * 0.72) * radius, height * 1.32),
        "face": (center + FACING * (height * 0.85) + Vector((0, 0, height * 0.28)), height * 0.52),
    }
    written = []
    for name, (loc, ortho) in views.items():
        focus = center + Vector((0, 0, height * (0.30 if name == "face" else 0.02)))
        if name == "face":
            loc = loc + Vector((0, 0, height * 0.28))
        cam = add_camera(f"{stem}_{name}", loc, focus, ortho)
        bpy.context.scene.camera = cam
        dest = PREVIEWS / f"{stem}_{name}.png"
        render_path(dest)
        written.append(str(dest.relative_to(REPO)))
    if extra_lights:
        front_loc, front_ortho = views["front"]
        focus = center + Vector((0, 0, height * 0.02))
        cam = add_camera(f"{stem}_lightcam", front_loc, focus, front_ortho)
        bpy.context.scene.camera = cam
        for kind in ("daylight", "warm_interior", "cinematic"):
            apply_light_rig(kind)
            dest = LIGHTS / f"{stem}_front_{kind}.png"
            render_path(dest, samples=20)
            written.append(str(dest.relative_to(REPO)))
        apply_light_rig("neutral")
    return written


def render_pair(pip_blend: Path, goat_blend: Path) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pips = append_blend(pip_blend)
    goats = append_blend(goat_blend)
    pip_meshes = [obj for obj in pips if obj.type == "MESH"]
    goat_meshes = [obj for obj in goats if obj.type == "MESH"]
    for obj in pip_meshes:
        obj.location.y -= 0.95
    for obj in goat_meshes:
        obj.location.y += 1.15
    bpy.context.view_layer.update()
    apply_light_rig("neutral")
    both = pip_meshes + goat_meshes
    mn, mx = bounds(both)
    center = (mn + mx) * 0.5
    height = max(mx.z - mn.z, 0.001)
    span = max(mx.x - mn.x, mx.y - mn.y, height)
    views = {
        "front": (center + FACING * span * 1.35, max(span * 1.15, height * 1.72)),
        "three_quarter": (
            center + (FACING * 0.75 + CHAR_LEFT * 0.75) * span * 1.25,
            max(span * 1.20, height * 1.78),
        ),
        "side": (center + CHAR_LEFT * span * 1.35, max(span * 1.15, height * 1.75)),
    }
    written = []
    for name, (loc, ortho) in views.items():
        cam = add_camera(f"pair_{name}", loc, center + Vector((0, 0, height * 0.02)), ortho)
        bpy.context.scene.camera = cam
        dest = PREVIEWS / f"pair_{name}.png"
        render_path(dest, samples=28)
        written.append(str(dest.relative_to(REPO)))
    ph = bounds(pip_meshes)
    gh = bounds(goat_meshes)
    pip_h = ph[1].z - ph[0].z
    goat_h = gh[1].z - gh[0].z
    return {
        "renders": written,
        "pip_height": pip_h,
        "goat_height": goat_h,
        "ratio": goat_h / pip_h if pip_h else 0.0,
    }


def refine_open(src: Path, dest: Path) -> None:
    assert_not_production_library(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    bpy.ops.wm.open_mainfile(filepath=str(dest), load_ui=False)


def main() -> int:
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    LIGHTS.mkdir(parents=True, exist_ok=True)
    HIRES.mkdir(parents=True, exist_ok=True)
    TEXTURES.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)

    pip_src = WORKING / "pip_highdetail_working.blend"
    goat_src = WORKING / "goat_highdetail_working.blend"
    pip_dest = HIRES / "pip_highres_candidate.blend"
    goat_dest = HIRES / "goat_highres_candidate.blend"

    refine_open(pip_src, pip_dest)
    pip_obj = mesh_obj()
    pip_img = primary_image()
    pip_colors = sample_colors(pip_obj, pip_img)
    pip_notes = suppress_pip_crest_stubs(pip_obj, pip_img, pip_colors)
    pip_tex = export_texture(pip_img, TEXTURES / "pip_highres_basecolor.png") if pip_img else None
    save_blend(pip_dest)
    pip_renders = render_subject("pip_final")

    refine_open(goat_src, goat_dest)
    goat_obj = mesh_obj()
    goat_img = primary_image()
    goat_colors = sample_colors(goat_obj, goat_img)
    goat_notes = paint_goat_teardrop(goat_obj, goat_img, goat_colors)
    goat_tex = export_texture(goat_img, TEXTURES / "goat_highres_basecolor.png") if goat_img else None
    save_blend(goat_dest)
    goat_renders = render_subject("goat_final")

    pair = render_pair(pip_dest, goat_dest)
    report = {
        "approved": False,
        "canonical_mutated": False,
        "theatrical_bound": False,
        "merge": False,
        "paid_resources": False,
        "blender": bpy.app.version_string,
        "working_preserved": [
            str(pip_src.relative_to(REPO)),
            str(goat_src.relative_to(REPO)),
        ],
        "pip": pip_notes,
        "goat": goat_notes,
        "pair": pair,
        "textures": {"pip": pip_tex, "goat": goat_tex},
        "renders": pip_renders + goat_renders + pair["renders"],
        "outputs": {
            "pip_blend": str(pip_dest.relative_to(REPO)),
            "goat_blend": str(goat_dest.relative_to(REPO)),
        },
        "primitive_rebuild_used": False,
        "whole_mesh_stretch": False,
        "satchel_hard_translate": False,
    }
    (REPORTS / "STAGE2_REFINE.json").write_text(json.dumps(report, indent=2) + "\n")
    (REPO / "artifacts/theatrical-v2/final-character-production/validation/STAGE2_REFINE.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print(json.dumps({"ok": True, "ratio": pair["ratio"], "pip": pip_notes, "goat": goat_notes}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
