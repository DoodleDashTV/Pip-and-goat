#!/usr/bin/env python3
"""Justin pass: brighter chartreuse Pip + fuller wings. No retopo/groom/rig."""
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
    lift_cream_face,
    render_views,
    smooth_selected,
)
from revise_v2_primaries import (  # noqa: E402
    color_map,
    mesh_obj,
    render_pair,
    save_blend,
    snap_to_ground,
    world_bounds,
)


def argv_after_dash() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]


def grade_pip_chartreuse(img) -> dict:
    """Second lift: more lime-chartreuse, less golden mustard. Do not touch teal/coral/eyes."""
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
    hue = np.zeros_like(v)
    mask_r = mx == r
    mask_g = (mx == g) & ~mask_r
    mask_b = ~mask_r & ~mask_g
    hue[mask_r] = ((g[mask_r] - b[mask_r]) / diff[mask_r]) / 6.0
    hue[mask_g] = (2.0 + (b[mask_g] - r[mask_g]) / diff[mask_g]) / 6.0
    hue[mask_b] = (4.0 + (r[mask_b] - g[mask_b]) / diff[mask_b]) / 6.0
    hue = np.mod(hue, 1.0)

    teal_m = (g > r + 0.08) & (b > r + 0.05) & (r < 0.40)
    coral_m = (r > 0.55) & (r > g + 0.15) & (b < 0.28)
    cinnamon_m = (r > 0.35) & (g < 0.45) & (b < 0.22) & (r > g + 0.08)
    eye_m = (g > 0.18) & (b < 0.22) & (r < 0.25) & (v < 0.45)
    body = (hue > 0.05) & (hue < 0.34) & (v > 0.14) & (s > 0.06) & (r + g > 0.40)
    body &= ~teal_m & ~coral_m & ~cinnamon_m & ~eye_m
    cream = body & (v > 0.55) & (s < 0.52)
    plumage = body & ~cream

    # Image 1 family: bright yellow-chartreuse (G slightly ahead of R), not golden mustard.
    hue[plumage] = 0.168 + (hue[plumage] - 0.168) * 0.22
    s[plumage] = np.clip(s[plumage] * 0.72 + 0.16, 0.28, 0.78)
    v[plumage] = np.clip(1.0 - (1.0 - v[plumage]) * 0.28 + 0.10, 0.0, 1.0)

    hue[cream] = 0.135 + (hue[cream] - 0.135) * 0.30
    s[cream] = np.clip(s[cream] * 0.55, 0.05, 0.34)
    v[cream] = np.clip(1.0 - (1.0 - v[cream]) * 0.22 + 0.04, 0.0, 1.0)

    hh = hue * 6.0
    i = np.floor(hh).astype(np.int32)
    f = hh - i
    p = v * (1.0 - s)
    q = v * (1.0 - s * f)
    t = v * (1.0 - s * (1.0 - f))
    i = np.mod(i, 6)
    nr, ng, nb = np.empty_like(v), np.empty_like(v), np.empty_like(v)
    for idx, (rr, gg, bb) in enumerate(((v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q))):
        m = i == idx
        nr[m], ng[m], nb[m] = rr[m], gg[m], bb[m]
    rgb[body, 0] = nr[body]
    rgb[body, 1] = ng[body]
    rgb[body, 2] = nb[body]
    img.pixels.foreach_set(rgb.reshape(-1))
    img.update()
    try:
        img.pack()
    except Exception:
        pass
    return {"plumage": int(plumage.sum()), "cream": int(cream.sum())}


def bump_shader(value: float = 1.16, sat: float = 1.02) -> str:
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        tree = mat.node_tree
        principled = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if principled is None:
            continue
        base = principled.inputs.get("Base Color")
        if base is None or not base.links:
            continue
        src = base.links[0].from_socket
        if src.node.type == "HUE_SAT":
            src.node.inputs["Value"].default_value = value
            src.node.inputs["Saturation"].default_value = sat
            return mat.name
        hsv = tree.nodes.new("ShaderNodeHueSaturation")
        hsv.location = (principled.location.x - 180, principled.location.y)
        hsv.inputs["Value"].default_value = value
        hsv.inputs["Saturation"].default_value = sat
        hsv.inputs["Hue"].default_value = 0.5
        tree.links.new(src, hsv.inputs["Color"])
        tree.links.new(hsv.outputs["Color"], base)
        return mat.name
    return ""


def enlarge_wings_fuller(obj, colors) -> dict:
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
        shoulder.y *= 0.38
        outer = [p for p in worlds.values() if abs(p.y) >= median_y]
        tip_z = min(p.z for p in outer)
        target_tip = 0.30
        moved = 0
        max_delta = 0.0
        for vid, world in worlds.items():
            rel = world - shoulder
            span = max(shoulder.z - tip_z, 0.08)
            along = max(0.0, min(1.0, (-rel.z) / span))
            out = max(0.0, min(1.0, (abs(world.y) - 0.16) / 0.32))
            weight = (0.22 + 0.78 * (along ** 1.05)) * (0.30 + 0.70 * out)
            sign = 1.0 if world.y >= 0 else -1.0
            scaled = Vector((rel.x * 1.04, rel.y * 1.22, rel.z * 1.08))
            delta = (scaled - rel) * weight
            if along > 0.35:
                drop = max(0.0, tip_z - target_tip) * ((along - 0.35) / 0.65) ** 1.25 * (0.35 + 0.65 * out)
                delta.z -= drop
            # Extra breadth so the front/back silhouette is fuller, not stubby.
            delta.y += sign * 0.055 * weight
            if delta.length > 0.11:
                delta *= 0.11 / delta.length
            verts[vid].co = imw @ (world + delta)
            moved += 1
            max_delta = max(max_delta, delta.length)
            all_ids.add(vid)
        notes[name] = {
            "count": len(ids),
            "moved": moved,
            "max_delta": max_delta,
            "tip_z_before": tip_z,
            "max_abs_y_before": max(ys),
        }
    obj.data.update()
    notes["smooth"] = smooth_selected(obj, all_ids, (0.20, 0.12))
    snap_to_ground(obj)
    return notes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pip-in", required=True)
    parser.add_argument("--pip-out", required=True)
    parser.add_argument("--goat", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv_after_dash())
    out = Path(args.out)
    clean = out / "clean"
    before = out / "before_this_pass"
    ckpt = out / "checkpoints"
    clean.mkdir(parents=True, exist_ok=True)
    before.mkdir(parents=True, exist_ok=True)
    ckpt.mkdir(parents=True, exist_ok=True)
    shutil.copy2(args.pip_in, ckpt / "pip_v2_before_justin_pass.blend")
    for name in (
        "pip_revised_front.png",
        "pip_revised_three_quarter.png",
        "pip_revised_side.png",
        "pip_revised_back.png",
        "pair_front.png",
    ):
        src = clean / name
        if src.exists():
            shutil.copy2(src, before / name)

    bpy.ops.wm.open_mainfile(filepath=args.pip_in, load_ui=False)
    pip = mesh_obj()
    colors, img = color_map(pip)
    grade = grade_pip_chartreuse(img) if img is not None else {}
    cream = lift_cream_face(pip, img, colors)
    shader = bump_shader(1.16, 1.02)
    wings = enlarge_wings_fuller(pip, colors)
    snap_to_ground(pip)
    inspect = inspect_mesh(pip)
    height = world_bounds(pip)[1].z - world_bounds(pip)[0].z
    save_blend(Path(args.pip_out))
    renders = render_views("pip_revised", clean, extra_sides=False)
    pair = render_pair(Path(args.pip_out), Path(args.goat), clean)
    report = {
        "approved": False,
        "canonical_mutated": False,
        "retopo": False,
        "groom": False,
        "rig": False,
        "glb_used": False,
        "paid_gpu": False,
        "target": "attached Image 1 bright yellow-chartreuse and larger wings",
        "grade": grade,
        "cream": cream,
        "shader": shader,
        "wings": wings,
        "inspect": inspect,
        "pip_height": height,
        "pair": pair,
        "renders": renders + pair["renders"],
    }
    (out / "JUSTIN_PIP_PASS.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "ok": True,
        "grade": grade,
        "wings": {k: wings.get(k) for k in ("left", "right")},
        "ratio": pair["ratio"],
        "height": height,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
