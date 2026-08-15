#!/usr/bin/env python3
"""Pull Pip brightness back from the blown-out Justin pass. Color only. No wing/retopo."""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from refine_v2_overnight import inspect_mesh, render_views  # noqa: E402
from revise_v2_primaries import color_map, mesh_obj, render_pair, save_blend, snap_to_ground, world_bounds  # noqa: E402


def argv_after_dash() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]


def pullback_albedo(img) -> dict:
    """Compress blown highlights and restore gentle midtone shading. Stay chartreuse, not mustard."""
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
    body = (hue > 0.05) & (hue < 0.34) & (v > 0.14) & (s > 0.05) & (r + g > 0.40)
    body &= ~teal_m & ~coral_m & ~cinnamon_m & ~eye_m
    cream = body & (v > 0.58) & (s < 0.50)
    plumage = body & ~cream

    # Slightly warmer than neon lime, still chartreuse.
    hue[plumage] = 0.152 + (hue[plumage] - 0.152) * 0.55
    s[plumage] = np.clip(s[plumage] * 0.90, 0.20, 0.68)
    # Restore form: compress highlights, keep midtones.
    v[plumage] = np.clip(np.power(v[plumage], 1.16) * 0.90, 0.0, 0.92)

    hue[cream] = 0.132 + (hue[cream] - 0.132) * 0.45
    s[cream] = np.clip(s[cream] * 0.78, 0.06, 0.32)
    v[cream] = np.clip(np.power(v[cream], 1.08) * 0.94, 0.0, 0.94)

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


def set_shader(value: float, sat: float) -> dict:
    notes = {"value": value, "sat": sat, "material": ""}
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
            notes["value_from"] = src.node.inputs["Value"].default_value
            notes["sat_from"] = src.node.inputs["Saturation"].default_value
            src.node.inputs["Value"].default_value = value
            src.node.inputs["Saturation"].default_value = sat
            notes["material"] = mat.name
            return notes
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
    before = out / "before_pullback"
    ckpt = out / "checkpoints"
    clean.mkdir(parents=True, exist_ok=True)
    before.mkdir(parents=True, exist_ok=True)
    ckpt.mkdir(parents=True, exist_ok=True)
    shutil.copy2(args.pip_in, ckpt / "pip_v2_too_bright.blend")
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
    _, img = color_map(pip)
    grade = pullback_albedo(img) if img is not None else {}
    shader = set_shader(1.02, 1.00)
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
        "wings_edited": False,
        "target": "pull back blown-out brightness; keep Image 1 chartreuse family and larger wings",
        "grade": grade,
        "shader": shader,
        "inspect": inspect,
        "pip_height": height,
        "pair": pair,
        "renders": renders + pair["renders"],
    }
    (out / "PIP_PULLBACK.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"ok": True, "grade": grade, "shader": shader, "ratio": pair["ratio"], "height": height}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
