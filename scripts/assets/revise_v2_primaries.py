#!/usr/bin/env python3
"""Controlled Pip/Goat v2 sculpt revision. No retopo, groom, rig, or canon replace."""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector

FACING = Vector((1.0, 0.0, 0.0))
RIGHT = Vector((0.0, 1.0, 0.0))  # character left is +Y when facing +X


def argv_after_dash() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]


def mesh_obj():
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("no mesh")
    return meshes[0]


def world_bounds(obj):
    coords = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    xs, ys, zs = zip(*[(c.x, c.y, c.z) for c in coords])
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def color_map(obj, size=512):
    img = next((image for image in bpy.data.images if image.size[0] > 0), None)
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


def coral(c):
    r, g, b = c
    return r > 0.55 and 0.12 < g < 0.55 and b < 0.28 and r > g + 0.15


def teal(c):
    r, g, b = c
    return b > 0.18 and g > 0.22 and g > r + 0.08 and b > r + 0.05 and r < 0.35


def cinnamon(c):
    r, g, b = c
    return r > 0.35 and 0.12 < g < 0.45 and b < 0.22 and r > g + 0.08


def snap_to_ground(obj):
    mn, _ = world_bounds(obj)
    obj.location.z -= mn.z
    bpy.context.view_layer.update()


def revise_pip(obj, colors) -> dict:
    mw = obj.matrix_world
    imw = mw.inverted()
    verts = obj.data.vertices
    notes = {}

    crest_ids = []
    for vid, col in colors.items():
        world = mw @ verts[vid].co
        if coral(col) and world.z >= 1.68:
            crest_ids.append(vid)
    if crest_ids:
        ys = sorted((mw @ verts[vid].co).y for vid in crest_ids)
        q1 = ys[len(ys) // 3]
        q2 = ys[(2 * len(ys)) // 3]
        groups = {"right": [], "center": [], "left": []}
        for vid in crest_ids:
            y = (mw @ verts[vid].co).y
            if y <= q1:
                groups["right"].append(vid)
            elif y >= q2:
                groups["left"].append(vid)
            else:
                groups["center"].append(vid)
        notes["crest_counts"] = {name: len(ids) for name, ids in groups.items()}
        for name, ids in groups.items():
            if not ids:
                continue
            worlds = [mw @ verts[vid].co for vid in ids]
            tip_z = max(p.z for p in worlds)
            for vid, world in zip(ids, worlds):
                # Hierarchy: center tallest, sides shorter, all sweep back (-X) and fan in Y.
                t = max(0.0, (world.z - 1.68) / max(tip_z - 1.68, 1e-4))
                delta = Vector((-0.034 * t, 0.0, 0.018 * t))
                if name == "left":
                    delta += Vector((-0.008 * t, 0.028 * t, -0.004 * t))
                elif name == "right":
                    delta += Vector((-0.008 * t, -0.028 * t, -0.004 * t))
                else:
                    delta += Vector((-0.006 * t, 0.0, 0.016 * t))
                verts[vid].co = imw @ (world + delta)
        obj.data.update()
        notes["crest"] = "spread three coral feathers, center tallest, sweep back"

    bag_ids = []
    for vid, col in colors.items():
        world = mw @ verts[vid].co
        # Bag body only. Do not pull the strap or neckerchief — that tears the fused mesh.
        if teal(col) and 0.38 < world.z < 0.82 and world.x > 0.28 and world.y > 0.00:
            bag_ids.append(vid)
    if bag_ids:
        centroid = sum((mw @ verts[vid].co for vid in bag_ids), Vector()) / len(bag_ids)
        target = Vector((0.018, 0.04, -0.02))
        moved = 0
        for vid in bag_ids:
            world = mw @ verts[vid].co
            dist = (world - centroid).length
            weight = max(0.0, 1.0 - dist / 0.13) ** 2
            if weight < 0.05:
                continue
            verts[vid].co = imw @ (world + target * weight)
            moved += 1
        obj.data.update()
        notes["satchel"] = {
            "from": list(centroid),
            "max_shift": list(target),
            "count": len(bag_ids),
            "moved": moved,
        }

    foot_ids = []
    for vid, col in colors.items():
        world = mw @ verts[vid].co
        if cinnamon(col) and world.z < 0.14 and world.x > -0.22:
            foot_ids.append(vid)
    left = [vid for vid in foot_ids if (mw @ verts[vid].co).y >= 0]
    right = [vid for vid in foot_ids if (mw @ verts[vid].co).y < 0]
    hallux = {}
    for name, ids in (("left", left), ("right", right)):
        if len(ids) < 20:
            continue
        worlds = [mw @ verts[vid].co for vid in ids]
        min_x = min(p.x for p in worlds)
        mid_x = sum(p.x for p in worlds) / len(worlds)
        pulled = 0
        for vid, world in zip(ids, worlds):
            back = (mid_x - world.x) / max(mid_x - min_x, 1e-4)
            if back < 0.35 or world.z > 0.09:
                continue
            # Plant a readable hallux behind the foot, on the ground.
            delta = Vector((-0.072 * back, 0.0, -world.z * 0.42 + 0.003))
            verts[vid].co = imw @ (world + delta)
            pulled += 1
        hallux[name] = pulled
    obj.data.update()
    notes["hallux"] = hallux
    snap_to_ground(obj)
    return notes


def paint_goat_back_patch(obj, img) -> dict:
    import numpy as np

    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape((h, w, 4))
    uv = obj.data.uv_layers.active.data
    mw = obj.matrix_world
    cinnamon_rgb = (0.62, 0.32, 0.16)
    stamps = 0
    seen = set()
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            vid = obj.data.loops[li].vertex_index
            world = mw @ obj.data.vertices[vid].co
            # Upper-back teardrop only — keep off the skull (z > ~1.45).
            on_back = world.x < -0.05
            teardrop = False
            if on_back and 1.17 <= world.z <= 1.38:
                t = (world.z - 1.17) / 0.21
                width = 0.125 * (1.0 - 0.50 * t)
                teardrop = abs(world.y) <= width
            tail = on_back and 0.74 <= world.z <= 0.90 and abs(world.y) <= 0.055 and world.x < -0.10
            if not (teardrop or tail):
                continue
            u, v = uv[li].uv
            cx = int(round(u * (w - 1))) % w
            cy = int(round(v * (h - 1))) % h
            key = (cx // 5, cy // 5)
            if key in seen:
                continue
            seen.add(key)
            rad = 52 if teardrop else 20
            y0, y1 = max(0, cy - rad), min(h, cy + rad + 1)
            x0, x1 = max(0, cx - rad), min(w, cx + rad + 1)
            yy, xx = np.ogrid[y0:y1, x0:x1]
            dist = ((yy - cy) / rad) ** 2 + ((xx - cx) / rad) ** 2
            mask = dist <= 1.0
            fall = np.clip(1.0 - np.sqrt(np.clip(dist, 0, 1)), 0.0, 1.0)
            region = px[y0:y1, x0:x1]
            alpha = (fall * (0.78 if teardrop else 0.45))[..., None]
            color = np.array([*cinnamon_rgb, 1.0], dtype=np.float32)
            region[mask] = region[mask] * (1.0 - alpha[mask]) + color * alpha[mask]
            stamps += 1
    img.pixels.foreach_set(px.reshape(-1))
    img.update()
    try:
        img.pack()
    except Exception:
        pass
    return {"stamps": stamps, "image": img.name, "size": [w, h]}


def revise_goat(obj, colors, img, pip_height: float) -> dict:
    notes = {}
    if img is not None:
        notes["back_patch"] = paint_goat_back_patch(obj, img)
    target = pip_height * 1.5
    mn, mx = world_bounds(obj)
    height = max(mx.z - mn.z, 1e-4)
    obj.scale *= target / height
    bpy.context.view_layer.update()
    snap_to_ground(obj)
    mn, mx = world_bounds(obj)
    notes["scale"] = {
        "from_height": height,
        "to_height": mx.z - mn.z,
        "factor": target / height,
        "target": target,
    }
    return notes


def apply_khronos() -> None:
    scene = bpy.context.scene
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.display_settings.display_device = "sRGB"


def setup_world_lights() -> None:
    scene = bpy.context.scene
    apply_khronos()
    world = bpy.data.worlds.new("RevWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.84, 0.87, 0.90, 1.0)
    bg.inputs["Strength"].default_value = 0.9
    key = bpy.data.lights.new("Key", "SUN")
    key.energy = 2.6
    key_obj = bpy.data.objects.new("Key", key)
    scene.collection.objects.link(key_obj)
    key_obj.rotation_euler = (0.72, 0.12, 0.35)
    fill = bpy.data.lights.new("Fill", "SUN")
    fill.energy = 0.65
    fill_obj = bpy.data.objects.new("Fill", fill)
    scene.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (0.95, -0.45, 3.3)


def add_camera(name, location, target, ortho):
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = ortho
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()
    return obj


def render_path(path: Path, samples: int = 24) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1080
    scene.render.resolution_y = 1920
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.filepath = str(path)
    scene.render.film_transparent = False
    scene.eevee.taa_render_samples = samples
    scene.eevee.use_shadows = True
    bpy.ops.render.render(write_still=True)


def render_turnaround(stem: str, out_dir: Path) -> list[str]:
    obj = mesh_obj()
    mn, mx = world_bounds(obj)
    center = (mn + mx) * 0.5
    height = max(mx.z - mn.z, 0.001)
    radius = max(mx.x - mn.x, mx.y - mn.y, height) * 1.55
    front = FACING.normalized()
    right = Vector((-front.y, front.x, 0.0))
    cam_z = center.z + height * 0.03
    views = {
        "front": center + front * radius + Vector((0, 0, cam_z - center.z)),
        "back": center - front * radius + Vector((0, 0, cam_z - center.z)),
        "side": center - right * radius + Vector((0, 0, cam_z - center.z)),
        "three_quarter": center + (front * 0.72 + right * 0.72) * radius + Vector((0, 0, height * 0.10)),
    }
    written = []
    setup_world_lights()
    for name, loc in views.items():
        cam = add_camera(f"{stem}_{name}", loc, center + Vector((0, 0, height * 0.02)), height * 1.28)
        bpy.context.scene.camera = cam
        dest = out_dir / f"{stem}_{name}.png"
        render_path(dest)
        written.append(str(dest))
    return written


def append_mesh(blend: Path, name: str):
    directory = str(blend) + "/Object/"
    before = set(bpy.data.objects)
    bpy.ops.wm.append(filepath=str(blend) + "/Object/output", directory=directory, filename="output")
    added = [obj for obj in bpy.data.objects if obj not in before]
    if not added:
        raise RuntimeError(f"append failed: {blend}")
    obj = added[0]
    obj.name = name
    return obj


def render_pair(pip_blend: Path, goat_blend: Path, out_dir: Path) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pip = append_mesh(pip_blend, "PipRevised")
    goat = append_mesh(goat_blend, "GoatRevised")
    snap_to_ground(pip)
    snap_to_ground(goat)
    pip_b = world_bounds(pip)
    goat_b = world_bounds(goat)
    pip_h = pip_b[1].z - pip_b[0].z
    goat_h = goat_b[1].z - goat_b[0].z
    # Face +X, stand side by side on +Y.
    pip.location.y = -0.95
    goat.location.y = 1.15
    bpy.context.view_layer.update()
    both = [pip, goat]
    coords = [obj.matrix_world @ Vector(corner) for obj in both for corner in obj.bound_box]
    xs, ys, zs = zip(*[(c.x, c.y, c.z) for c in coords])
    mn, mx = Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))
    center = (mn + mx) * 0.5
    height = max(mx.z - mn.z, 0.001)
    span = max(mx.x - mn.x, mx.y - mn.y, height)
    setup_world_lights()
    written = []
    views = {
        "front": (center + FACING * span * 1.7 + Vector((0, 0, height * 0.04)), height * 1.55),
        "three_quarter": (
            center + (FACING * 0.75 + RIGHT * 0.75) * span * 1.55 + Vector((0, 0, height * 0.10)),
            height * 1.62,
        ),
    }
    for name, (loc, ortho) in views.items():
        cam = add_camera(f"pair_{name}", loc, center + Vector((0, 0, height * 0.02)), ortho)
        bpy.context.scene.camera = cam
        dest = out_dir / f"pair_{name}.png"
        render_path(dest, samples=28)
        written.append(str(dest))
    return {
        "renders": written,
        "pip_height": pip_h,
        "goat_height": goat_h,
        "ratio": goat_h / pip_h if pip_h else 0.0,
    }


def save_blend(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path), compress=True, copy=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pip-in", required=True)
    parser.add_argument("--goat-in", required=True)
    parser.add_argument("--pip-out", required=True)
    parser.add_argument("--goat-out", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv_after_dash())
    out = Path(args.out)
    clean = out / "clean"
    clean.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=args.pip_in, load_ui=False)
    pip = mesh_obj()
    pip_colors, _ = color_map(pip)
    pip_notes = revise_pip(pip, pip_colors)
    pip_h = world_bounds(pip)[1].z - world_bounds(pip)[0].z
    save_blend(Path(args.pip_out))
    pip_renders = render_turnaround("pip_revised", clean)

    bpy.ops.wm.open_mainfile(filepath=args.goat_in, load_ui=False)
    goat = mesh_obj()
    goat_colors, goat_img = color_map(goat)
    goat_notes = revise_goat(goat, goat_colors, goat_img, pip_h)
    save_blend(Path(args.goat_out))
    goat_renders = render_turnaround("goat_revised", clean)

    pair = render_pair(Path(args.pip_out), Path(args.goat_out), clean)
    report = {
        "approved": False,
        "canonical_mutated": False,
        "retopo": False,
        "groom": False,
        "rig": False,
        "glb_used": False,
        "pip": pip_notes,
        "goat": goat_notes,
        "pip_height": pip_h,
        "pair": pair,
        "renders": pip_renders + goat_renders + pair["renders"],
    }
    (out / "REVISION.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"ok": True, "ratio": pair["ratio"], "renders": len(report["renders"])}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
