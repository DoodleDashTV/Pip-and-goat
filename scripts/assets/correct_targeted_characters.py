#!/usr/bin/env python3
"""Targeted corrections only. No rebuild, retopo, rig, or canon replace.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/correct_targeted_characters.py
"""
from __future__ import annotations

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
    add_camera,
    append_blend,
    bounds,
    khronos,
    meshes,
    render_path,
    save_blend,
)
from polish_final_character_finish import feature_lights  # noqa: E402
from refine_v2_overnight import adjacency, raster_tri  # noqa: E402
from theatrical_rebuild_common import assert_not_production_library  # noqa: E402
from theatrical_v1_common import principled_mat  # noqa: E402

HIRES = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution"
WORKING = REPO / "theatrical-foundation/proposed/final-character-production/working"
TEXTURES = REPO / "theatrical-foundation/proposed/final-character-production/textures"
CORR = REPO / "artifacts/theatrical-v2/final-character-production/corrections"
REPORTS = REPO / "theatrical-foundation/proposed/final-character-production/reports"
CINNAMON = (0.56, 0.26, 0.11)
OATMEAL = (0.78, 0.70, 0.56)


def mesh_obj(prefer: str | None = None):
    found = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    if prefer:
        for obj in found:
            if prefer.lower() in obj.name.lower() and "cornea" not in obj.name.lower() and "catch" not in obj.name.lower():
                return obj
    if not found:
        raise RuntimeError("no mesh")
    return found[0]


def color_image():
    for img in bpy.data.images:
        if img.size[0] > 64 and "color" in img.name.lower() and "normal" not in img.name.lower():
            return img
    images = [img for img in bpy.data.images if img.size[0] > 64]
    return max(images, key=lambda img: img.size[0] * img.size[1]) if images else None


def sample_colors(obj, img, size=192):
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


def world_of(obj, vid):
    return obj.matrix_world @ obj.data.vertices[vid].co


def shoot(name, loc, focus, ortho, dest, samples=26):
    cam = add_camera(name, loc, focus, ortho)
    bpy.context.scene.camera = cam
    render_path(dest, samples=samples)
    return str(dest.relative_to(REPO))


def goat_true_eye_centers(obj, colors) -> list[Vector]:
    """Prefer forward dark iris clusters, not brow/cinnamon."""
    mw = obj.matrix_world
    pts = []
    for vid, col in colors.items():
        r, g, b = col
        w = mw @ obj.data.vertices[vid].co
        dark = (r + g + b) < 0.95 and max(r, g, b) < 0.55
        not_hoof = w.z > 2.05
        forward = w.x > 0.22
        face = 2.18 < w.z < 2.48 and abs(w.y) > 0.06
        if dark and not_hoof and forward and face:
            pts.append(w)
    left = [p for p in pts if p.y >= 0]
    right = [p for p in pts if p.y < 0]
    centers = []
    for group in (left, right):
        if len(group) < 6:
            continue
        # Most-forward quartile, to sit on the globe not the brow.
        group = sorted(group, key=lambda p: p.x, reverse=True)
        use = group[: max(6, len(group) // 3)]
        centers.append(sum(use, Vector()) / len(use))
    return centers


def fix_goat_forehead_spots(obj, colors) -> dict:
    extras = [o for o in bpy.data.objects if o.type == "MESH" and o != obj]
    before = []
    for o in extras:
        before.append({"name": o.name, "location": list(o.location), "dims": list((Vector(o.bound_box[6]) - Vector(o.bound_box[0])))})
    # Exact cause: Goat_Catch_* are detached emissive highlight spheres
    # placed above the detected brow centroids. They are the white spots.
    removed = []
    for o in list(bpy.data.objects):
        if o.name.startswith("Goat_Catch"):
            removed.append({"name": o.name, "location": list(o.location)})
            bpy.data.objects.remove(o, do_unlink=True)
    centers = goat_true_eye_centers(obj, colors)
    moved = []
    corneas = [o for o in bpy.data.objects if o.name.startswith("Goat_Cornea")]
    for i, cornea in enumerate(sorted(corneas, key=lambda o: o.location.y, reverse=True)):
        if i >= len(centers):
            break
        old = list(cornea.location)
        target = centers[i] + FACING * 0.012
        cornea.location = target
        moved.append({"name": cornea.name, "from": old, "to": list(target)})
        # Tiny in-eye catchlight: forward only, no upward forehead offset.
        catch_mat = bpy.data.materials.get("Goat_Catch") or principled_mat(
            "Goat_Catch", (1, 1, 1), roughness=0.04, specular=0.8, coat=0.5, emission=0.28
        )
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.0055, location=target + FACING * 0.034 + Vector((0.0, 0.004, 0.006)))
        catch = bpy.context.active_object
        catch.name = f"Goat_Catch_in_eye_{i}"
        catch.data.materials.clear()
        catch.data.materials.append(catch_mat)
    return {
        "cause": "Goat_Catch_0 and Goat_Catch_1 were detached emissive highlight spheres placed above brow-detected centroids, not in-eye catchlights.",
        "removed": removed,
        "corneas_repositioned": moved,
        "true_eye_centers": [list(c) for c in centers],
        "before_extras": before,
    }


def copy_original_goat_color(dest_img) -> dict:
    """Restore Color pixels from the untouched working blend, then we repaint."""
    src_path = WORKING / "goat_highdetail_working.blend"
    with bpy.data.libraries.load(str(src_path), link=False) as (data_from, data_to):
        names = [n for n in data_from.images if n and "color" in n.lower() and "normal" not in n.lower()]
        data_to.images = names[:1]
    if not data_to.images or data_to.images[0] is None:
        return {"restored": False, "reason": "no source color"}
    src = data_to.images[0]
    if tuple(src.size) != tuple(dest_img.size):
        src.scale(int(dest_img.size[0]), int(dest_img.size[1]))
    import numpy as np

    px = np.empty(int(src.size[0]) * int(src.size[1]) * 4, dtype=np.float32)
    src.pixels.foreach_get(px)
    dest_img.pixels.foreach_set(px)
    dest_img.update()
    bpy.data.images.remove(src)
    return {"restored": True, "from": str(src_path.name), "size": list(dest_img.size)}


def paint_organic_teardrop(obj, img, colors) -> dict:
    import numpy as np

    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape((h, w, 4))
    uv = obj.data.uv_layers.active.data
    mw = obj.matrix_world
    # Scarf bottom from orange verts.
    zs = []
    for vid, col in colors.items():
        r, g, b = col
        world = mw @ obj.data.vertices[vid].co
        if r > 0.50 and 0.12 < g < 0.48 and b < 0.22 and r > g + 0.18 and world.x < 0.18 and 1.85 < world.z < 2.70:
            zs.append(world.z)
    zs.sort()
    top = (zs[int(len(zs) * 0.18)] if zs else 2.28) - 0.04
    bot = top - 0.58
    color = np.array([*CINNAMON, 1.0], dtype=np.float32)
    oat = np.array([*OATMEAL, 1.0], dtype=np.float32)
    filled = 0

    def alpha(world: Vector) -> float:
        # Upper-back only. No tail bar. No rectangle.
        if world.x > -0.02 or not (bot <= world.z <= top):
            return 0.0
        t = (top - world.z) / max(top - bot, 1e-4)
        # Rounded crown, cosine sides, point down. Soft edge.
        width = 0.22 * ((1.0 - t) ** 0.72) * (0.78 + 0.22 * (1.0 - t))
        ay = abs(world.y)
        if ay > width:
            return 0.0
        radial = ay / max(width, 1e-4)
        edge = 0.5 + 0.5 * np.cos(min(1.0, radial) * np.pi)
        body = (1.0 - t) ** 0.35
        return float(max(0.0, min(0.78, edge * body * 0.92)))

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
                color,
                0.74,
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
        "cause": "Previous Color-map stamp used a hard-width teardrop plus a separate vertical tail-base bar (z 0.92-1.16), which rasterized as a rectangle.",
        "fix": "Restored original working Color map, then painted a cosine-edged organic teardrop only. No tail bar.",
        "top": top,
        "bot": bot,
        "filled": filled,
        "no_tail_bar": True,
    }


def teal(c):
    r, g, b = c
    return b > 0.18 and g > 0.22 and g > r + 0.08 and b > r + 0.05 and r < 0.35


def cinnamon(c):
    r, g, b = c
    return r > 0.35 and 0.12 < g < 0.45 and b < 0.22 and r > g + 0.08


def yellow(c):
    r, g, b = c
    if teal(c) or cinnamon(c):
        return False
    return r + g > 0.45 and b < 0.42 and g > 0.28


def isolate_pip_wings(obj, colors):
    mw = obj.matrix_world
    verts = obj.data.vertices
    adj = adjacency(obj)
    seeds = {"left": [], "right": []}
    for vid, col in colors.items():
        if not yellow(col):
            continue
        w = mw @ verts[vid].co
        if abs(w.y) > 0.30 and 0.62 < w.z < 1.18 and w.x > -0.10:
            seeds["left" if w.y >= 0 else "right"].append(vid)

    def flood(seed_ids, sign):
        seen = set()
        stack = list(seed_ids)
        while stack:
            vid = stack.pop()
            if vid in seen or vid not in colors:
                continue
            if not yellow(colors[vid]) or teal(colors[vid]):
                continue
            w = mw @ verts[vid].co
            if not (0.30 < w.z < 1.30 and w.y * sign > 0.16 and w.x > -0.16):
                continue
            seen.add(vid)
            stack.extend(adj[vid])
        return seen

    return {"left": flood(seeds["left"], 1.0), "right": flood(seeds["right"], -1.0)}


def lengthen_pip_wings(obj, colors) -> dict:
    groups = isolate_pip_wings(obj, colors)
    mw = obj.matrix_world
    imw = mw.inverted()
    verts = obj.data.vertices
    notes = {}
    for name, ids in groups.items():
        if len(ids) < 80:
            notes[name] = {"count": len(ids), "skipped": True}
            continue
        worlds = {vid: mw @ verts[vid].co for vid in ids}
        zs = sorted(p.z for p in worlds.values())
        shoulder_z = zs[int(len(zs) * 0.86)]
        high = [p for p in worlds.values() if p.z >= shoulder_z - 0.05]
        shoulder = sum(high, Vector()) / len(high)
        tip_z = min(p.z for p in worlds.values())
        target_tip = 0.30
        drop_needed = max(0.0, tip_z - target_tip)
        moved = 0
        max_delta = 0.0
        for vid, world in worlds.items():
            # Preserve shoulder roots. Extend lower feather structure only.
            along = max(0.0, min(1.0, (shoulder.z - world.z) / max(shoulder.z - tip_z, 0.08)))
            if along < 0.18:
                continue
            # Do not pull the satchel/strap or bag-side intersection.
            if teal(colors.get(vid, (0, 0, 0))):
                continue
            if world.x > 0.30 and world.y > 0.02 and world.z < 0.90:
                continue
            weight = ((along - 0.18) / 0.82) ** 1.25
            delta = Vector((0.012 * weight, 0.0, -drop_needed * weight))
            # Keep wings against the body: slight inward Y toward torso on the hanging part.
            delta.y += (-0.018 if world.y > 0 else 0.018) * weight
            if delta.length > 0.16:
                delta *= 0.16 / delta.length
            verts[vid].co = imw @ (world + delta)
            moved += 1
            max_delta = max(max_delta, delta.length)
        obj.data.update()
        after = [mw @ verts[vid].co for vid in ids]
        notes[name] = {
            "count": len(ids),
            "moved": moved,
            "max_delta": max_delta,
            "tip_z_before": tip_z,
            "tip_z_after": min(p.z for p in after),
            "shoulder_z": shoulder_z,
            "target_tip": target_tip,
        }
    return notes


def pip_eye_clusters(obj, colors):
    mw = obj.matrix_world
    clusters = {"left": [], "right": []}
    for vid, col in colors.items():
        r, g, b = col
        w = mw @ obj.data.vertices[vid].co
        if not (1.48 < w.z < 1.82 and w.x > 0.12 and 0.04 < abs(w.y) < 0.24):
            continue
        # Iris/pupil/dark lid: not cream, not yellow body, not teal cloth.
        cream = r > 0.70 and g > 0.62 and b > 0.40
        if cream or teal(col) or cinnamon(col):
            continue
        dark_or_green = (r + g + b) < 1.15 and (g >= r - 0.05)
        if not dark_or_green:
            continue
        clusters["left" if w.y >= 0 else "right"].append((vid, w))
    return clusters


def measure_eye(pts):
    if not pts:
        return {}
    xs, ys, zs = zip(*[(p.x, p.y, p.z) for _, p in pts])
    return {
        "n": len(pts),
        "center": [sum(xs) / len(xs), sum(ys) / len(ys), sum(zs) / len(zs)],
        "span_x": max(xs) - min(xs),
        "span_y": max(ys) - min(ys),
        "span_z": max(zs) - min(zs),
        "globe": ((max(xs) - min(xs)) + (max(ys) - min(ys)) + (max(zs) - min(zs))) / 3.0,
        "forward": max(xs),
        "opening_w": max(ys) - min(ys),
        "opening_h": max(zs) - min(zs),
    }


def balance_pip_eyes(obj, colors) -> dict:
    clusters = pip_eye_clusters(obj, colors)
    before = {side: measure_eye(pts) for side, pts in clusters.items()}
    if not before["left"] or not before["right"]:
        return {"before": before, "skipped": True, "reason": "could not isolate both eyes"}
    # Match the smaller opening to the larger, and match forward/vertical centers.
    left_c = Vector(before["left"]["center"])
    right_c = Vector(before["right"]["center"])
    mid_z = 0.5 * (left_c.z + right_c.z)
    mid_x = 0.5 * (left_c.x + right_c.x)
    target_w = 0.5 * (before["left"]["opening_w"] + before["right"]["opening_w"])
    target_h = 0.5 * (before["left"]["opening_h"] + before["right"]["opening_h"])
    target_d = 0.5 * (before["left"]["span_x"] + before["right"]["span_x"])
    mw = obj.matrix_world
    imw = mw.inverted()
    verts = obj.data.vertices
    scales = {}
    for side, pts in clusters.items():
        meas = before[side]
        center = Vector(meas["center"])
        sx = target_d / max(meas["span_x"], 1e-4)
        sy = target_w / max(meas["opening_w"], 1e-4)
        sz = target_h / max(meas["opening_h"], 1e-4)
        # Keep scale close to 1 to avoid tearing.
        sx = max(0.88, min(1.12, sx))
        sy = max(0.88, min(1.12, sy))
        sz = max(0.88, min(1.12, sz))
        target_center = Vector((mid_x, center.y, mid_z))
        shift = target_center - center
        if shift.length > 0.025:
            shift *= 0.025 / shift.length
        for vid, world in pts:
            local = world - center
            scaled = Vector((local.x * sx, local.y * sy, local.z * sz))
            verts[vid].co = imw @ (center + scaled + shift)
        scales[side] = {"sx": sx, "sy": sy, "sz": sz, "shift": list(shift)}
    obj.data.update()
    after_clusters = pip_eye_clusters(obj, colors)
    after = {side: measure_eye(pts) for side, pts in after_clusters.items()}
    return {
        "before": before,
        "after": after,
        "scales": scales,
        "cause": "Measured left/right eye openings from isolated face-dark/green verts. Imbalance treated as geometry/opening, not camera perspective.",
    }


def render_goat_validation() -> list[str]:
    feature_lights()
    obj = mesh_obj("Goat")
    mn, mx = bounds([obj] + [o for o in bpy.data.objects if o.type == "MESH"])
    center = (mn + mx) * 0.5
    height = mx.z - mn.z
    written = []
    CORR.mkdir(parents=True, exist_ok=True)
    face_focus = Vector((0.28, 0.0, height * 0.78))
    written.append(shoot("goat_front_close", face_focus + FACING * 0.55, face_focus, height * 0.42, CORR / "01_goat_corrected_front_closeup.png"))
    back_focus = Vector((-0.10, 0.0, height * 0.58))
    written.append(shoot("goat_rear", back_focus - FACING * 1.8, center + Vector((0, 0, 0.02)), height * 1.28, CORR / "02_goat_corrected_rear.png"))
    rq = center + (-FACING * 0.70 + CHAR_LEFT * 0.70) * height * 1.1
    written.append(shoot("goat_rear_3q", rq, center + Vector((0, 0, 0.02)), height * 1.32, CORR / "03_goat_corrected_rear_three_quarter.png"))
    return written


def render_pip_validation() -> list[str]:
    feature_lights()
    obj = mesh_obj("Pip")
    mn, mx = bounds([obj])
    center = (mn + mx) * 0.5
    height = mx.z - mn.z
    written = []
    face = Vector((0.22, 0.0, height * 0.78))
    written.append(shoot("pip_front_close", face + FACING * 0.70, face, height * 0.38, CORR / "04_pip_corrected_front_neutral_closeup.png"))
    q = face + (FACING * 0.55 + CHAR_LEFT * 0.40)
    written.append(shoot("pip_3q_close", q, face, height * 0.42, CORR / "05_pip_corrected_three_quarter_closeup.png"))
    written.append(shoot("pip_front_full", center + FACING * height * 1.45, center + Vector((0, 0, 0.02)), height * 1.28, CORR / "06_pip_corrected_front_full.png"))
    written.append(shoot("pip_3q_full", center + (FACING * 0.72 + CHAR_LEFT * 0.72) * height * 1.35, center + Vector((0, 0, 0.02)), height * 1.32, CORR / "07_pip_corrected_three_quarter_full.png"))
    return written


def render_pair(pip_blend, goat_blend) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pips = append_blend(pip_blend)
    goats = append_blend(goat_blend)
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
    dest = CORR / "08_corrected_pair.png"
    path = shoot("pair", center + FACING * span * 1.35, center + Vector((0, 0, 0.02)), max(span * 1.15, height * 1.72), dest, samples=28)
    ph = bounds([o for o in pips if o.type == "MESH"])
    gh = bounds([o for o in goats if o.type == "MESH"])
    return {
        "render": path,
        "pip_height": ph[1].z - ph[0].z,
        "goat_height": gh[1].z - gh[0].z,
        "ratio": (gh[1].z - gh[0].z) / (ph[1].z - ph[0].z),
    }


def main() -> int:
    CORR.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    goat_path = HIRES / "goat_highres_candidate.blend"
    pip_path = HIRES / "pip_highres_candidate.blend"

    assert_not_production_library(goat_path)
    bpy.ops.wm.open_mainfile(filepath=str(goat_path), load_ui=False)
    goat = mesh_obj("Goat")
    gimg = color_image()
    gcolors = sample_colors(goat, gimg)
    spots = fix_goat_forehead_spots(goat, gcolors)
    restored = copy_original_goat_color(gimg)
    # Resample after restore so scarf/cinnamon detection uses original colors.
    gcolors = sample_colors(goat, gimg)
    back = paint_organic_teardrop(goat, gimg, gcolors)
    save_blend(goat_path)
    goat_renders = render_goat_validation()

    assert_not_production_library(pip_path)
    bpy.ops.wm.open_mainfile(filepath=str(pip_path), load_ui=False)
    pip = mesh_obj("Pip")
    pimg = color_image()
    pcolors = sample_colors(pip, pimg)
    eyes_before_clusters = pip_eye_clusters(pip, pcolors)
    wings = lengthen_pip_wings(pip, pcolors)
    eyes = balance_pip_eyes(pip, pcolors)
    save_blend(pip_path)
    pip_renders = render_pip_validation()
    pair = render_pair(pip_path, goat_path)

    report = {
        "approved": False,
        "canonical_mutated": False,
        "theatrical_bound": False,
        "merge": False,
        "paid_resources": False,
        "primitive_rebuild_used": False,
        "prediction_pose_copied": False,
        "blender": bpy.app.version_string,
        "goat_forehead_spots": spots,
        "goat_color_restore": restored,
        "goat_back_marking": back,
        "pip_wings": wings,
        "pip_eyes": eyes,
        "pip_eye_isolation_n": {k: len(v) for k, v in eyes_before_clusters.items()},
        "renders": goat_renders + pip_renders + [pair["render"]],
        "pair": pair,
    }
    (REPORTS / "TARGETED_CORRECTION.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "ok": True,
        "spots_removed": [r["name"] for r in spots["removed"]],
        "corneas_moved": len(spots["corneas_repositioned"]),
        "wings": wings,
        "eyes_skipped": eyes.get("skipped", False),
        "ratio": pair["ratio"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
