#!/usr/bin/env python3
"""Pass 2: larger Goat teardrop + Pip outer-wing length. No retopo/groom/rig."""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from refine_v2_overnight import (  # noqa: E402
    inspect_mesh,
    isolate_wings,
    render_pair_with_side,
    render_views,
    scarf_bottom_z,
    smooth_selected,
)
from revise_v2_primaries import color_map, mesh_obj, save_blend, snap_to_ground, world_bounds  # noqa: E402


def argv_after_dash() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]


def neck_scarf_bottom(obj, colors) -> float:
    mw = obj.matrix_world
    zs = []
    for vid, col in colors.items():
        r, g, b = col
        world = mw @ obj.data.vertices[vid].co
        orange = r > 0.50 and 0.12 < g < 0.48 and b < 0.22 and r > g + 0.18
        if orange and world.x < 0.08 and abs(world.y) < 0.22 and world.z > 1.95:
            zs.append(world.z)
    if not zs:
        return scarf_bottom_z(obj, colors)
    zs.sort()
    return zs[int(len(zs) * 0.20)]


def paint_larger_teardrop(obj, img, colors) -> dict:
    import numpy as np

    from refine_v2_overnight import raster_tri

    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape((h, w, 4))
    uv = obj.data.uv_layers.active.data
    mw = obj.matrix_world
    top = neck_scarf_bottom(obj, colors) - 0.02
    bot = top - 0.62
    color = np.array([0.62, 0.23, 0.09, 1.0], dtype=np.float32)
    filled = 0
    tris = 0

    def alpha(world: Vector) -> float:
        if world.x > -0.04 or not (bot <= world.z <= top):
            return 0.0
        t = (top - world.z) / max(top - bot, 1e-4)
        # Wider, rounded crown; taper to a point.
        width = 0.265 * ((1.0 - t) ** 0.48) * (0.50 + 0.50 * (1.0 - t))
        ay = abs(world.y)
        if ay > width:
            return 0.0
        edge = 1.0 - (ay / max(width, 1e-4)) ** 1.6
        return max(0.0, min(1.0, edge * (0.90 - 0.18 * t)))

    for poly in obj.data.polygons:
        loops = list(poly.loop_indices)
        worlds = [mw @ obj.data.vertices[obj.data.loops[li].vertex_index].co for li in loops]
        alphas = [alpha(world) for world in worlds]
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
                0.92,
            )
            tris += 1
    img.pixels.foreach_set(px.reshape(-1))
    img.update()
    try:
        img.pack()
    except Exception:
        pass
    return {"top": top, "bot": bot, "filled_px": filled, "tris": tris, "image": img.name}


def extend_wing_tips(obj, colors) -> dict:
    mw = obj.matrix_world
    imw = mw.inverted()
    verts = obj.data.vertices
    groups = isolate_wings(obj, colors)
    notes = {}
    all_ids = set()
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
        tip_z = min(p.z for p in outer)
        moved = 0
        max_delta = 0.0
        for vid, world in worlds.items():
            rel = world - shoulder
            span = max(shoulder.z - tip_z, 0.08)
            along = max(0.0, min(1.0, (-rel.z) / span))
            out = max(0.0, min(1.0, (abs(world.y) - 0.17) / 0.30))
            if along < 0.50 or out < 0.28:
                continue
            t = ((along - 0.50) / 0.50) * ((out - 0.28) / 0.72)
            delta = Vector((0.0, (0.055 * t) * (1.0 if world.y >= 0 else -1.0), -0.095 * t))
            if delta.length > 0.10:
                delta *= 0.10 / delta.length
            verts[vid].co = imw @ (world + delta)
            moved += 1
            max_delta = max(max_delta, delta.length)
            all_ids.add(vid)
        notes[name] = {"count": len(ids), "moved": moved, "max_delta": max_delta, "tip_z_before": tip_z}
    obj.data.update()
    notes["smooth"] = smooth_selected(obj, all_ids, (0.20, 0.12))
    snap_to_ground(obj)
    return notes


def lift_remaining_dark_yellow(img) -> dict:
    import numpy as np

    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    rgb = px.reshape((-1, 4))
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    diff = np.clip(mx - mn, 1e-6, None)
    v = mx
    s = np.where(mx > 1e-5, diff / np.clip(mx, 1e-5, None), 0.0)
    h = np.zeros_like(v)
    mask_r = mx == r
    mask_g = (mx == g) & ~mask_r
    mask_b = ~mask_r & ~mask_g
    h[mask_r] = ((g[mask_r] - b[mask_r]) / diff[mask_r]) / 6.0
    h[mask_g] = (2.0 + (b[mask_g] - r[mask_g]) / diff[mask_g]) / 6.0
    h[mask_b] = (4.0 + (r[mask_b] - g[mask_b]) / diff[mask_b]) / 6.0
    h = np.mod(h, 1.0)
    dark = (h > 0.08) & (h < 0.28) & (v < 0.52) & (s > 0.12) & (r + g > 0.35)
    rgb[dark, 0] = np.clip(r[dark] * 1.10 + 0.04, 0, 1)
    rgb[dark, 1] = np.clip(g[dark] * 1.14 + 0.05, 0, 1)
    rgb[dark, 2] = np.clip(b[dark] * 0.90, 0, 1)
    img.pixels.foreach_set(rgb.reshape(-1))
    img.update()
    try:
        img.pack()
    except Exception:
        pass
    return {"dark_lifted": int(dark.sum())}


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
    shutil.copy2(args.pip_in, ckpt / "pip_v2_pass1.blend")
    shutil.copy2(args.goat_in, ckpt / "goat_v2_pass1.blend")

    bpy.ops.wm.open_mainfile(filepath=args.pip_in, load_ui=False)
    pip = mesh_obj()
    colors, img = color_map(pip)
    dark = lift_remaining_dark_yellow(img) if img is not None else {}
    wings = extend_wing_tips(pip, colors)
    pip_inspect = inspect_mesh(pip)
    pip_h = world_bounds(pip)[1].z - world_bounds(pip)[0].z
    save_blend(Path(args.pip_out))
    pip_renders = render_views("pip_revised", clean, extra_sides=True)

    bpy.ops.wm.open_mainfile(filepath=args.goat_in, load_ui=False)
    goat = mesh_obj()
    goat_colors, goat_img = color_map(goat)
    patch = paint_larger_teardrop(goat, goat_img, goat_colors) if goat_img is not None else {}
    goat_inspect = inspect_mesh(goat)
    save_blend(Path(args.goat_out))
    goat_renders = render_views("goat_revised", clean, extra_sides=False)

    pair = render_pair_with_side(Path(args.pip_out), Path(args.goat_out), clean)
    report = {
        "approved": False,
        "pass": 2,
        "canonical_mutated": False,
        "retopo": False,
        "groom": False,
        "rig": False,
        "glb_used": False,
        "blender": bpy.app.version_string,
        "pip": {"dark": dark, "wings": wings, "inspect": pip_inspect, "height": pip_h},
        "goat": {"patch": patch, "inspect": goat_inspect},
        "pair": pair,
        "renders": pip_renders + goat_renders + pair["renders"],
    }
    (out / "OVERNIGHT_PASS2.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "ok": True,
        "ratio": pair["ratio"],
        "wings": {k: wings.get(k) for k in ("left", "right")},
        "patch": {k: patch.get(k) for k in ("top", "bot", "filled_px", "tris")},
        "dark": dark,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
