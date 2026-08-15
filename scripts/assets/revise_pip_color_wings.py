#!/usr/bin/env python3
"""Brighten Pip to binding yellow-chartreuse and enlarge wings. No retopo/groom/rig."""
from __future__ import annotations

import colorsys
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from revise_v2_primaries import (  # noqa: E402
    cinnamon,
    color_map,
    coral,
    mesh_obj,
    render_pair,
    render_turnaround,
    save_blend,
    snap_to_ground,
    teal,
    world_bounds,
)


def argv_after_dash() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]


def is_body_yellow(c) -> bool:
    r, g, b = c
    if teal(c) or coral(c) or cinnamon(c):
        return False
    h, s, v = colorsys.rgb_to_hsv(max(r, 0), max(g, 0), max(b, 0))
    return 0.06 < h < 0.32 and v > 0.16 and s > 0.08 and r + g > 0.45


def grade_pip_albedo(img) -> dict:
    import numpy as np

    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    rgb = px.reshape((-1, 4))
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    hsv = np.zeros((rgb.shape[0], 3), dtype=np.float32)
    # Vectorized-ish HSV via colorsys is too slow in a Python loop over 64M px.
    # Use approximate hue from RGB.
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    diff = np.clip(mx - mn, 1e-6, None)
    v = mx
    s = np.where(mx > 1e-5, diff / np.clip(mx, 1e-5, None), 0.0)
    h = np.zeros_like(v)
    mask_r = (mx == r)
    mask_g = (mx == g) & ~mask_r
    mask_b = ~mask_r & ~mask_g
    h[mask_r] = ((g[mask_r] - b[mask_r]) / diff[mask_r]) / 6.0
    h[mask_g] = (2.0 + (b[mask_g] - r[mask_g]) / diff[mask_g]) / 6.0
    h[mask_b] = (4.0 + (r[mask_b] - g[mask_b]) / diff[mask_b]) / 6.0
    h = np.mod(h, 1.0)

    teal_m = (g > r + 0.08) & (b > r + 0.05) & (r < 0.40)
    coral_m = (r > 0.55) & (r > g + 0.15) & (b < 0.28)
    cinnamon_m = (r > 0.35) & (g < 0.45) & (b < 0.22) & (r > g + 0.08)
    eye_m = (g > 0.18) & (b < 0.22) & (r < 0.25) & (v < 0.45)
    body = (h > 0.06) & (h < 0.32) & (v > 0.16) & (s > 0.08) & (r + g > 0.45)
    body &= ~teal_m & ~coral_m & ~cinnamon_m & ~eye_m
    cream = body & (v > 0.60) & (s < 0.48)
    plumage = body & ~cream

    # Lift muddy olive toward bright yellow-chartreuse.
    h[plumage] = 0.145 + (h[plumage] - 0.145) * 0.28
    s[plumage] = np.clip(s[plumage] * 0.78 + 0.14, 0.22, 0.82)
    v[plumage] = 1.0 - (1.0 - v[plumage]) * 0.38
    v[plumage] = np.clip(v[plumage] + 0.08, 0.0, 1.0)

    # Soft cream-yellow cheeks / lower face / belly.
    h[cream] = 0.13 + (h[cream] - 0.13) * 0.35
    s[cream] = np.clip(s[cream] * 0.62, 0.06, 0.38)
    v[cream] = np.clip(1.0 - (1.0 - v[cream]) * 0.32, 0.0, 1.0)

    hh = h * 6.0
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
    changed = body
    rgb[changed, 0] = nr[changed]
    rgb[changed, 1] = ng[changed]
    rgb[changed, 2] = nb[changed]
    img.pixels.foreach_set(rgb.reshape(-1))
    img.update()
    try:
        img.pack()
    except Exception:
        pass
    return {
        "pixels": int(img.size[0] * img.size[1]),
        "plumage": int(plumage.sum()),
        "cream": int(cream.sum()),
    }


def lift_shader() -> str:
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
            src.node.inputs["Value"].default_value = 1.08
            src.node.inputs["Saturation"].default_value = 1.03
            return mat.name
        hsv = tree.nodes.new("ShaderNodeHueSaturation")
        hsv.location = (principled.location.x - 180, principled.location.y)
        hsv.inputs["Value"].default_value = 1.08
        hsv.inputs["Saturation"].default_value = 1.03
        hsv.inputs["Hue"].default_value = 0.5
        tree.links.new(src, hsv.inputs["Color"])
        tree.links.new(hsv.outputs["Color"], base)
        return mat.name
    return ""


def enlarge_wings(obj, colors) -> dict:
    mw = obj.matrix_world
    imw = mw.inverted()
    verts = obj.data.vertices
    left, right = [], []
    for vid, col in colors.items():
        if not is_body_yellow(col):
            continue
        world = mw @ verts[vid].co
        if world.z < 0.18 or world.z > 1.28 or world.x < -0.20:
            continue
        if abs(world.y) < 0.18:
            continue
        (left if world.y >= 0 else right).append((vid, world))

    notes = {"left": len(left), "right": len(right)}
    for name, group in (("left", left), ("right", right)):
        if len(group) < 40:
            continue
        zs = sorted(p.z for _, p in group)
        shoulder_z = zs[int(len(zs) * 0.82)]
        inner = [p for _, p in group if p.z >= shoulder_z - 0.08]
        if not inner:
            inner = [p for _, p in group]
        shoulder = sum(inner, Vector()) / len(inner)
        # Keep the attach closer to the body.
        shoulder.y *= 0.55
        moved = 0
        max_delta = 0.0
        for vid, world in group:
            rel = world - shoulder
            # Stronger stretch on the lower, outer feather mass.
            tip = max(0.0, min(1.0, (-rel.z) / 0.55)) * max(0.0, min(1.0, (abs(world.y) - 0.18) / 0.22))
            weight = 0.20 + 0.80 * tip
            scaled = Vector((rel.x * 1.10, rel.y * 1.48, rel.z * 1.78))
            delta = (scaled - rel) * weight
            if delta.length > 0.22:
                delta *= 0.22 / delta.length
            verts[vid].co = imw @ (world + delta)
            moved += 1
            max_delta = max(max_delta, delta.length)
        notes[f"{name}_moved"] = moved
        notes[f"{name}_max_delta"] = max_delta
        notes[f"{name}_shoulder"] = list(shoulder)
    obj.data.update()
    snap_to_ground(obj)
    return notes


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--pip-in", required=True)
    parser.add_argument("--pip-out", required=True)
    parser.add_argument("--goat", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv_after_dash())
    out = Path(args.out)
    clean = out / "clean"
    clean.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=args.pip_in, load_ui=False)
    pip = mesh_obj()
    colors, img = color_map(pip)
    grade = grade_pip_albedo(img) if img is not None else {}
    shader = lift_shader()
    wings = enlarge_wings(pip, colors)
    save_blend(Path(args.pip_out))
    pip_renders = render_turnaround("pip_revised", clean)
    pair = render_pair(Path(args.pip_out), Path(args.goat), clean)
    report = {
        "approved": False,
        "canonical_mutated": False,
        "retopo": False,
        "groom": False,
        "rig": False,
        "glb_used": False,
        "target": "binding Pip_front / Pip_three_quarter yellow-chartreuse and wing length",
        "grade": grade,
        "shader": shader,
        "wings": wings,
        "pair": pair,
        "renders": pip_renders + pair["renders"],
    }
    (out / "COLOR_WING_REVISION.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"ok": True, "wings": {k: wings[k] for k in wings if "shoulder" not in k}, "ratio": pair["ratio"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
