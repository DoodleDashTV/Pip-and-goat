#!/usr/bin/env python3
"""Pass 3: unfurl Pip wings backward; repaint Goat teardrop below scarf only."""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from refine_v2_overnight import inspect_mesh, isolate_wings, raster_tri, render_pair_with_side, render_views, smooth_selected  # noqa: E402
from revise_v2_primaries import color_map, mesh_obj, save_blend, snap_to_ground, world_bounds  # noqa: E402


def argv_after_dash() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]


def unfurl_wings_back(obj, colors) -> dict:
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
            rear = max(0.0, min(1.0, (0.28 - world.x) / 0.40))
            if out < 0.30 or (along < 0.28 and rear < 0.35):
                continue
            t = max(along, rear * 0.65) * (0.35 + 0.65 * out)
            sign = 1.0 if world.y >= 0 else -1.0
            delta = Vector((-0.075 * t, 0.035 * t * sign, -0.040 * t))
            if delta.length > 0.09:
                delta *= 0.09 / delta.length
            verts[vid].co = imw @ (world + delta)
            moved += 1
            max_delta = max(max_delta, delta.length)
            all_ids.add(vid)
        notes[name] = {"count": len(ids), "moved": moved, "max_delta": max_delta}
    obj.data.update()
    notes["smooth"] = smooth_selected(obj, all_ids, (0.18, 0.10))
    snap_to_ground(obj)
    return notes


def paint_scarf_teardrop(obj, img) -> dict:
    import numpy as np

    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape((h, w, 4))
    uv = obj.data.uv_layers.active.data
    mw = obj.matrix_world
    # Hard world band: below the neck wrap, above mid-back, off the skull.
    top, bot = 2.20, 1.78
    color = np.array([0.61, 0.24, 0.10, 1.0], dtype=np.float32)
    filled = 0
    tris = 0

    def alpha(world: Vector) -> float:
        if world.x > -0.07 or not (bot <= world.z <= top):
            return 0.0
        t = (top - world.z) / (top - bot)
        width = 0.24 * ((1.0 - t) ** 0.50) * (0.55 + 0.45 * (1.0 - t))
        ay = abs(world.y)
        if ay > width:
            return 0.0
        edge = 1.0 - (ay / max(width, 1e-4)) ** 1.7
        return max(0.0, min(1.0, edge * (0.88 - 0.16 * t)))

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
                0.90,
            )
            tris += 1
    img.pixels.foreach_set(px.reshape(-1))
    img.update()
    try:
        img.pack()
    except Exception:
        pass
    return {"top": top, "bot": bot, "filled_px": filled, "tris": tris}


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
    ckpt = out / "checkpoints"
    clean.mkdir(parents=True, exist_ok=True)
    ckpt.mkdir(parents=True, exist_ok=True)
    shutil.copy2(args.pip_in, ckpt / "pip_v2_pass2.blend")

    bpy.ops.wm.open_mainfile(filepath=args.pip_in, load_ui=False)
    pip = mesh_obj()
    colors, _ = color_map(pip)
    wings = unfurl_wings_back(pip, colors)
    pip_inspect = inspect_mesh(pip)
    pip_h = world_bounds(pip)[1].z - world_bounds(pip)[0].z
    save_blend(Path(args.pip_out))
    pip_renders = render_views("pip_revised", clean, extra_sides=True)

    bpy.ops.wm.open_mainfile(filepath=args.goat_in, load_ui=False)
    goat = mesh_obj()
    _, goat_img = color_map(goat)
    patch = paint_scarf_teardrop(goat, goat_img) if goat_img is not None else {}
    goat_inspect = inspect_mesh(goat)
    save_blend(Path(args.goat_out))
    goat_renders = render_views("goat_revised", clean, extra_sides=False)
    pair = render_pair_with_side(Path(args.pip_out), Path(args.goat_out), clean)
    report = {
        "approved": False,
        "pass": 3,
        "canonical_mutated": False,
        "retopo": False,
        "groom": False,
        "rig": False,
        "glb_used": False,
        "blender": bpy.app.version_string,
        "pip": {"wings": wings, "inspect": pip_inspect, "height": pip_h},
        "goat": {"patch": patch, "inspect": goat_inspect},
        "pair": pair,
        "renders": pip_renders + goat_renders + pair["renders"],
    }
    (out / "OVERNIGHT_PASS3.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"ok": True, "ratio": pair["ratio"], "wings": wings, "patch": patch}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
