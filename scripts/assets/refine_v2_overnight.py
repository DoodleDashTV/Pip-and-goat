#!/usr/bin/env python3
"""Overnight Pip/Goat v2 sculpt refinement. No retopo, groom, rig, or canon replace."""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from revise_pip_color_wings import grade_pip_albedo, is_body_yellow, lift_shader  # noqa: E402
from revise_v2_primaries import (  # noqa: E402
    FACING,
    RIGHT,
    add_camera,
    cinnamon,
    color_map,
    coral,
    mesh_obj,
    render_pair,
    render_path,
    save_blend,
    setup_world_lights,
    snap_to_ground,
    teal,
    world_bounds,
)


def argv_after_dash() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]


def adjacency(obj):
    adj = defaultdict(set)
    for poly in obj.data.polygons:
        ids = list(poly.vertices)
        for i, a in enumerate(ids):
            b = ids[(i + 1) % len(ids)]
            adj[a].add(b)
            adj[b].add(a)
    return adj


def isolate_wings(obj, colors) -> dict[str, set[int]]:
    mw = obj.matrix_world
    verts = obj.data.vertices
    adj = adjacency(obj)

    def world_of(vid):
        return mw @ verts[vid].co

    seeds = {"left": [], "right": []}
    for vid, col in colors.items():
        if not is_body_yellow(col):
            continue
        w = world_of(vid)
        if abs(w.y) > 0.30 and 0.58 < w.z < 1.16 and w.x > -0.12:
            seeds["left" if w.y >= 0 else "right"].append(vid)

    def flood(seed_ids, sign):
        seen = set()
        stack = list(seed_ids)
        while stack:
            vid = stack.pop()
            if vid in seen or vid not in colors:
                continue
            if not is_body_yellow(colors[vid]):
                continue
            w = world_of(vid)
            if not (0.40 < w.z < 1.28 and w.y * sign > 0.17 and w.x > -0.18):
                continue
            seen.add(vid)
            stack.extend(adj[vid])
        return seen

    return {"left": flood(seeds["left"], 1.0), "right": flood(seeds["right"], -1.0)}


def enlarge_wings(obj, groups) -> dict:
    mw = obj.matrix_world
    imw = mw.inverted()
    verts = obj.data.vertices
    notes = {}
    for name, ids in groups.items():
        if len(ids) < 40:
            notes[name] = {"count": len(ids), "skipped": True}
            continue
        worlds = {vid: mw @ verts[vid].co for vid in ids}
        zs = sorted(p.z for p in worlds.values())
        ys = sorted(abs(p.y) for p in worlds.values())
        shoulder_z = zs[int(len(zs) * 0.82)]
        median_y = ys[len(ys) // 2]
        high = [p for p in worlds.values() if p.z >= shoulder_z - 0.06]
        shoulder = sum(high, Vector()) / len(high)
        shoulder.y *= 0.42
        outer = [p for p in worlds.values() if abs(p.y) >= median_y]
        tip_z = min(p.z for p in outer) if outer else zs[0]
        target_tip = 0.36
        moved = 0
        max_delta = 0.0
        for vid, world in worlds.items():
            rel = world - shoulder
            span = max(shoulder.z - tip_z, 0.08)
            along = max(0.0, min(1.0, (-rel.z) / span))
            out = max(0.0, min(1.0, (abs(world.y) - 0.17) / 0.30))
            weight = (along ** 1.10) * (0.28 + 0.72 * out)
            scaled = Vector((rel.x * 1.05, rel.y * 1.30, rel.z * 1.10))
            delta = (scaled - rel) * weight
            if along > 0.40:
                drop = max(0.0, tip_z - target_tip) * ((along - 0.40) / 0.60) ** 1.35 * (0.40 + 0.60 * out)
                delta.z -= drop
            if delta.length > 0.15:
                delta *= 0.15 / delta.length
            verts[vid].co = imw @ (world + delta)
            moved += 1
            max_delta = max(max_delta, delta.length)
        notes[name] = {
            "count": len(ids),
            "moved": moved,
            "max_delta": max_delta,
            "tip_z_before": tip_z,
            "shoulder": list(shoulder),
        }
    obj.data.update()
    smooth_ids = set().union(*groups.values())
    notes["smooth"] = smooth_selected(obj, smooth_ids, (0.28, 0.18))
    snap_to_ground(obj)
    return notes


def smooth_selected(obj, ids, factors) -> dict:
    if not ids:
        return {"verts": 0}
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    verts = [bm.verts[i] for i in ids if i < len(bm.verts)]
    for factor in factors:
        bmesh.ops.smooth_vert(bm, verts=verts, factor=factor, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return {"verts": len(ids), "factors": list(factors)}


def lift_cream_face(obj, img, colors) -> dict:
    import numpy as np

    if img is None or not obj.data.uv_layers:
        return {"stamps": 0}
    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape((h, w, 4))
    uv = obj.data.uv_layers.active.data
    mw = obj.matrix_world
    cream = (0.97, 0.91, 0.64, 1.0)
    stamps = 0
    seen = set()
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            vid = obj.data.loops[li].vertex_index
            if vid not in colors:
                continue
            world = mw @ obj.data.vertices[vid].co
            if world.z < 1.36 or world.z > 1.72 or world.x < 0.18 or abs(world.y) > 0.20:
                continue
            if coral(colors[vid]) or teal(colors[vid]) or cinnamon(colors[vid]):
                continue
            u, v = uv[li].uv
            cx = int(round(u * (w - 1))) % w
            cy = int(round(v * (h - 1))) % h
            key = (cx, cy)
            if key in seen:
                continue
            seen.add(key)
            rad = 10
            y0, y1 = max(0, cy - rad), min(h, cy + rad + 1)
            x0, x1 = max(0, cx - rad), min(w, cx + rad + 1)
            yy, xx = np.ogrid[y0:y1, x0:x1]
            dist = ((yy - cy) / rad) ** 2 + ((xx - cx) / rad) ** 2
            mask = dist <= 1.0
            fall = np.clip(1.0 - np.sqrt(np.clip(dist, 0, 1)), 0.0, 1.0)
            region = px[y0:y1, x0:x1]
            alpha = (fall * 0.38)[..., None]
            color = np.array(cream, dtype=np.float32)
            region[mask] = region[mask] * (1.0 - alpha[mask]) + color * alpha[mask]
            stamps += 1
    img.pixels.foreach_set(px.reshape(-1))
    img.update()
    try:
        img.pack()
    except Exception:
        pass
    return {"stamps": stamps}


def stagger_crest_profile(obj, colors) -> dict:
    mw = obj.matrix_world
    imw = mw.inverted()
    verts = obj.data.vertices
    crest = []
    for vid, col in colors.items():
        world = mw @ verts[vid].co
        if coral(col) and world.z >= 1.60:
            crest.append((vid, world))
    if len(crest) < 30:
        return {"skipped": True, "count": len(crest)}
    attach_pts = [p for _, p in crest if p.z <= 1.74]
    attach = sum(attach_pts, Vector()) / len(attach_pts) if attach_pts else Vector((0.22, 0.0, 1.68))
    high = [(vid, p) for vid, p in crest if p.z >= 1.80] or crest
    center_tip = max(high, key=lambda item: item[1].z - 0.18 * abs(item[1].y))[1]
    left_tip = max(high, key=lambda item: item[1].y + 0.20 * item[1].z)[1]
    right_tip = max(high, key=lambda item: -item[1].y + 0.20 * item[1].z)[1]
    tips = {"center": center_tip, "left": left_tip, "right": right_tip}
    counts = {"center": 0, "left": 0, "right": 0}
    for vid, world in crest:
        dists = {name: (world - tip).length for name, tip in tips.items()}
        nearest = min(dists, key=dists.get)
        t = max(0.0, min(1.0, (world.z - 1.62) / 0.40))
        if t < 0.20:
            continue
        if nearest == "center":
            extra = Vector((-0.055 * t, 0.0, 0.018 * t))
        elif nearest == "left":
            extra = Vector((0.018 * t, 0.028 * t, 0.012 * t))
        else:
            extra = Vector((0.018 * t, -0.028 * t, 0.012 * t))
        if extra.length > 0.06:
            extra *= 0.06 / extra.length
        verts[vid].co = imw @ (world + extra)
        counts[nearest] += 1
    obj.data.update()
    return {"counts": counts, "tips": {k: list(v) for k, v in tips.items()}}


def soften_principled() -> dict:
    notes = {}
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        principled = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if principled is None:
            continue
        rough = principled.inputs.get("Roughness")
        spec = principled.inputs.get("Specular IOR Level") or principled.inputs.get("Specular")
        if rough is not None and not rough.links:
            notes["roughness_from"] = rough.default_value
            rough.default_value = min(max(rough.default_value, 0.48), 0.62)
            notes["roughness_to"] = rough.default_value
        if spec is not None and not spec.links:
            notes["specular_from"] = spec.default_value
            spec.default_value = 0.28
        notes["material"] = mat.name
    return notes


def scarf_bottom_z(obj, colors) -> float:
    mw = obj.matrix_world
    zs = []
    for vid, col in colors.items():
        r, g, b = col
        world = mw @ obj.data.vertices[vid].co
        orange = r > 0.50 and 0.12 < g < 0.48 and b < 0.22 and r > g + 0.18
        if orange and world.x < 0.10 and 1.70 < world.z < 2.55:
            zs.append(world.z)
    return min(zs) if zs else 2.18


def teardrop_alpha(world: Vector, top: float, bot: float) -> float:
    if world.x > -0.05 or not (bot <= world.z <= top):
        return 0.0
    t = (top - world.z) / max(top - bot, 1e-4)
    width = 0.195 * ((1.0 - t) ** 0.55) * (0.42 + 0.58 * (1.0 - t))
    ay = abs(world.y)
    if ay > width:
        return 0.0
    edge = 1.0 - (ay / max(width, 1e-4)) ** 2
    return max(0.0, min(1.0, edge * (0.72 + 0.28 * (1.0 - t))))


def raster_tri(px, pts, alphas, color, strength):
    import numpy as np

    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    minx, maxx = max(int(min(xs)), 0), min(int(max(xs)) + 1, px.shape[1] - 1)
    miny, maxy = max(int(min(ys)), 0), min(int(max(ys)) + 1, px.shape[0] - 1)
    if maxx <= minx or maxy <= miny:
        return 0
    (x0, y0), (x1, y1), (x2, y2) = pts
    den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if abs(den) < 1e-8:
        return 0
    written = 0
    yy, xx = np.mgrid[miny : maxy + 1, minx : maxx + 1]
    w0 = ((y1 - y2) * (xx - x2) + (x2 - x1) * (yy - y2)) / den
    w1 = ((y2 - y0) * (xx - x2) + (x0 - x2) * (yy - y2)) / den
    w2 = 1.0 - w0 - w1
    inside = (w0 >= -0.01) & (w1 >= -0.01) & (w2 >= -0.01)
    if not inside.any():
        return 0
    a = (w0 * alphas[0] + w1 * alphas[1] + w2 * alphas[2]) * strength
    a = np.clip(a, 0.0, 1.0)
    region = px[miny : maxy + 1, minx : maxx + 1]
    mask = inside & (a > 0.02)
    if not mask.any():
        return 0
    aa = a[mask][..., None]
    region[mask] = region[mask] * (1.0 - aa) + color * aa
    return int(mask.sum())


def paint_goat_teardrop(obj, img, colors) -> dict:
    import numpy as np

    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape((h, w, 4))
    uv = obj.data.uv_layers.active.data
    mw = obj.matrix_world
    top = scarf_bottom_z(obj, colors) - 0.03
    bot = top - 0.52
    color = np.array([0.60, 0.24, 0.10, 1.0], dtype=np.float32)
    filled = 0
    tris = 0
    for poly in obj.data.polygons:
        loops = list(poly.loop_indices)
        worlds = [mw @ obj.data.vertices[obj.data.loops[li].vertex_index].co for li in loops]
        alphas = [teardrop_alpha(world, top, bot) for world in worlds]
        if max(alphas) < 0.04:
            continue
        uvs = [uv[li].uv for li in loops]
        pts = [(float(u) * (w - 1), float(v) * (h - 1)) for u, v in uvs]
        for i in range(1, len(pts) - 1):
            filled += raster_tri(
                px,
                [pts[0], pts[i], pts[i + 1]],
                [alphas[0], alphas[i], alphas[i + 1]],
                color,
                0.88,
            )
            tris += 1
    img.pixels.foreach_set(px.reshape(-1))
    img.update()
    try:
        img.pack()
    except Exception:
        pass
    return {"top": top, "bot": bot, "filled_px": filled, "tris": tris, "image": img.name}


def scale_goat_to_pip(obj, pip_height: float) -> dict:
    mn, mx = world_bounds(obj)
    height = max(mx.z - mn.z, 1e-4)
    target = pip_height * 1.5
    if abs(height - target) / target < 0.02:
        snap_to_ground(obj)
        return {"unchanged": True, "height": height, "target": target, "ratio": height / pip_height}
    obj.scale *= target / height
    bpy.context.view_layer.update()
    snap_to_ground(obj)
    mn, mx = world_bounds(obj)
    return {
        "from_height": height,
        "to_height": mx.z - mn.z,
        "factor": target / height,
        "target": target,
    }


def render_views(stem: str, out_dir: Path, extra_sides: bool = False) -> list[str]:
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
    if extra_sides:
        views["side_left"] = center + right * radius + Vector((0, 0, cam_z - center.z))
        views["side_right"] = center - right * radius + Vector((0, 0, cam_z - center.z))
    written = []
    setup_world_lights()
    for name, loc in views.items():
        cam = add_camera(f"{stem}_{name}", loc, center + Vector((0, 0, height * 0.02)), height * 1.28)
        bpy.context.scene.camera = cam
        dest = out_dir / f"{stem}_{name}.png"
        render_path(dest)
        written.append(str(dest))
    return written


def render_pair_with_side(pip_blend: Path, goat_blend: Path, out_dir: Path) -> dict:
    pair = render_pair(pip_blend, goat_blend, out_dir)
    # Rebuild a side pair in the current empty-after-pair scene by re-appending.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    from revise_v2_primaries import append_mesh

    pip = append_mesh(pip_blend, "PipRevised")
    goat = append_mesh(goat_blend, "GoatRevised")
    snap_to_ground(pip)
    snap_to_ground(goat)
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
    loc = center - RIGHT * span * 1.7 + Vector((0, 0, height * 0.04))
    cam = add_camera("pair_side", loc, center + Vector((0, 0, height * 0.02)), height * 1.58)
    bpy.context.scene.camera = cam
    dest = out_dir / "pair_side.png"
    render_path(dest, samples=28)
    pair["renders"] = list(pair["renders"]) + [str(dest)]
    return pair


def inspect_mesh(obj) -> dict:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.edges.ensure_lookup_table()
    nonmanifold = sum(1 for e in bm.edges if not e.is_manifold)
    boundary = sum(1 for e in bm.edges if e.is_boundary)
    bm.free()
    mats = [slot.material.name if slot.material else None for slot in obj.material_slots]
    return {
        "verts": len(obj.data.vertices),
        "tris": sum(len(p.vertices) - 2 for p in obj.data.polygons),
        "nonmanifold_edges": nonmanifold,
        "boundary_edges": boundary,
        "materials": mats,
        "images": [
            {"name": im.name, "size": list(im.size), "packed": bool(im.packed_file)}
            for im in bpy.data.images
            if im.size[0] > 0
        ],
        "libraries": [lib.filepath for lib in bpy.data.libraries],
    }


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
    ckpt = out / "checkpoints"
    ckpt.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=args.pip_in, load_ui=False)
    pip = mesh_obj()
    pip_colors, pip_img = color_map(pip)
    grade = grade_pip_albedo(pip_img) if pip_img is not None else {}
    cream = lift_cream_face(pip, pip_img, pip_colors)
    shader = lift_shader()
    shade = soften_principled()
    wings = enlarge_wings(pip, isolate_wings(pip, pip_colors))
    crest = stagger_crest_profile(pip, pip_colors)
    snap_to_ground(pip)
    pip_inspect = inspect_mesh(pip)
    pip_h = world_bounds(pip)[1].z - world_bounds(pip)[0].z
    save_blend(Path(args.pip_out))
    save_blend(ckpt / "pip_v2_overnight.blend")
    pip_renders = render_views("pip_revised", clean, extra_sides=True)

    bpy.ops.wm.open_mainfile(filepath=args.goat_in, load_ui=False)
    goat = mesh_obj()
    goat_colors, goat_img = color_map(goat)
    # Scale first so the teardrop is painted in the final world frame.
    goat_scale = scale_goat_to_pip(goat, pip_h)
    patch = paint_goat_teardrop(goat, goat_img, goat_colors) if goat_img is not None else {}
    goat_inspect = inspect_mesh(goat)
    save_blend(Path(args.goat_out))
    save_blend(ckpt / "goat_v2_overnight.blend")
    goat_renders = render_views("goat_revised", clean, extra_sides=False)

    pair = render_pair_with_side(Path(args.pip_out), Path(args.goat_out), clean)
    report = {
        "approved": False,
        "canonical_mutated": False,
        "retopo": False,
        "groom": False,
        "rig": False,
        "glb_used": False,
        "blender": bpy.app.version_string,
        "pip": {
            "grade": grade,
            "cream": cream,
            "shader": shader,
            "shade": shade,
            "wings": wings,
            "crest": crest,
            "inspect": pip_inspect,
            "height": pip_h,
        },
        "goat": {"patch": patch, "scale": goat_scale, "inspect": goat_inspect},
        "pair": pair,
        "renders": pip_renders + goat_renders + pair["renders"],
    }
    (out / "OVERNIGHT_REVISION.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "ok": True,
        "ratio": pair["ratio"],
        "pip_height": pip_h,
        "goat_height": pair["goat_height"],
        "wing_left": wings.get("left", {}),
        "wing_right": wings.get("right", {}),
        "patch": {k: patch.get(k) for k in ("top", "bot", "filled_px", "tris")},
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
