#!/usr/bin/env python3
"""V4 HDRI qualification. One HDRI identity per fresh Blender process.

Does not overwrite the purchased 15k source. Does not change V7 art systems.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
import cinematic_component_recovery_v6 as v6
from cinematic_contextual_recovery_v7 import finish_rock, load_lib
from cinematic_hero_rebuild_v5 import ROCK_BLEND, ROCK_NAMES, _append_objects, _dup_group, _dup_mesh, _fit_scale
from cinematic_riverbank_v1 import WATER_Z, riverbank_sample
from cinematic_shoreline_v1 import transition_color
from cinematic_water_lock_v1 import test_cfg
from memory_safe_asset_loader_v1 import exclude_hidden_library_masters, image_audit
from v7_resource_probe import scene_counts, snapshot

OUT = Path("/workspace/artifacts/tivvlejoy-scenery-showcase-30s/hdri-qualify-v4")
SOURCE_HDRI = Path("/tmp/o14-lookdev/expanded-original14/sky_hdri/HDRi_JPG_Pack/sk2/Image0001.jpg")
H8_PATH = Path("/tmp/tj_hdri_diag_8k.jpg")
H4_PATH = Path("/tmp/tj_hdri_diag_4k.jpg")


def parse_args(argv):
    p = argparse.ArgumentParser()
    p.add_argument("--tag", required=True)
    p.add_argument("--mode", choices=("isolate", "visual"), required=True)
    p.add_argument("--hdri", choices=("h15", "h8", "h4"), required=True)
    p.add_argument("--res", default="64x64")
    p.add_argument("--samples", type=int, default=1)
    return p.parse_args(argv)


def hwm() -> int | None:
    try:
        for line in Path("/proc/self/status").read_text().splitlines():
            if line.startswith("VmHWM:"):
                return int(line.split()[1]) * 1024
    except OSError:
        return None
    return None


def hdri_path(kind: str) -> Path:
    if kind == "h8":
        return H8_PATH
    if kind == "h4":
        return H4_PATH
    return SOURCE_HDRI


def install_chosen_hdri(kind: str, rot_z: float) -> str:
    path = hdri_path(kind)
    original = v6.HDRI
    v6.HDRI = path
    try:
        return v6.install_hdri(rot_z, strength=0.88)
    finally:
        v6.HDRI = original


def build_visual(cfg) -> None:
    col = v6._col("TJ_V4_HDRI_VIS")
    bounds = (-8.0, 4.0, -16.0, -4.0)

    def color_fn(x, y, z):
        return transition_color(x, y)

    v6.build_strip_terrain(col, "TJ_V4_Terrain", bounds, (48, 56), color_fn)
    water = v6.build_water_prism(col, bounds, name="TJ_V4_Water")
    v6.apply_locked_water_material(water, cfg)
    rocks = _append_objects(ROCK_BLEND, ROCK_NAMES) if ROCK_BLEND.exists() else []
    if rocks:
        src = rocks[0]
        z, _ = riverbank_sample(-1.6, -10.2)
        fitted = _fit_scale(src, 1.65, 1.0)
        obj = _dup_mesh(src, (-1.6, -10.2, z), fitted, 0.4, 0.08, col, "TJ_V4_Rock")
        finish_rock(obj, wet=True)
    library = load_lib(("beech_a",))
    if library.get("beech_a"):
        z, _ = riverbank_sample(-4.2, -5.4)
        _dup_group(library["beech_a"], (-4.2, -5.4, max(z, WATER_Z + 0.15)), 7.2, 0.3, 0.12, col, "TJ_V4_Beech")
    exclude_hidden_library_masters()
    v6.add_sun(cfg["sunEnergy"], cfg["sunEulerDeg"])
    v6.add_camera("TJ_V4_Cam", (2.4, -15.4, 1.55), (-0.8, -9.8, WATER_Z + 0.10), 40.0)


def main(argv=None) -> int:
    args = parse_args(argv or [])
    w, h = (int(x) for x in args.res.lower().split("x"))
    v6.RENDER_RES = (w, h)
    v6.reset_scene()
    scene = bpy.context.scene
    scene.cycles.use_denoising = False
    scene.cycles.samples = int(args.samples)
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    cfg = test_cfg("C")
    empty = snapshot("empty")
    installed = install_chosen_hdri(args.hdri, cfg["hdriRotZ"])
    if args.mode == "visual":
        build_visual(cfg)
    else:
        v6.add_camera("TJ_V4_IsoCam", (2.6, -16.0, 1.48), (-0.6, -10.7, WATER_Z + 0.12), 40.0)
    before = snapshot("before_cycles", extra=scene_counts())
    dest = OUT / f"{args.tag}.png"
    OUT.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(dest)
    err = None
    t0 = time.time()
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as exc:  # noqa: BLE001
        err = f"{type(exc).__name__}:{exc}"
    render_s = time.time() - t0
    after = snapshot("after_cycles", extra=scene_counts())
    images = image_audit()
    payload = {
        "schema": "TJ_HDRI_QUALIFY_V4",
        "tag": args.tag,
        "mode": args.mode,
        "hdri": args.hdri,
        "installed": installed,
        "resolution": [w, h],
        "samples": int(args.samples),
        "emptyRss": empty.get("rss"),
        "before": before,
        "after": after,
        "hwm": hwm(),
        "renderSeconds": render_s,
        "error": err,
        "png": dest.is_file() and dest.stat().st_size > 0,
        "pngBytes": dest.stat().st_size if dest.is_file() else 0,
        "pngPath": str(dest),
        "images": {
            "count": images.get("loadedCount"),
            "rawBytes": images.get("estimatedRawBytes"),
            "largest": images.get("largest10"),
        },
        "counts": scene_counts(),
    }
    (OUT / f"{args.tag}.json").write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({
        "event": "v4_done",
        "tag": args.tag,
        "hwm": payload["hwm"],
        "after": after.get("rss"),
        "png": payload["png"],
        "seconds": render_s,
        "error": err,
    }), flush=True)
    return 0 if err is None and payload["png"] else 2


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    raise SystemExit(main(argv))
