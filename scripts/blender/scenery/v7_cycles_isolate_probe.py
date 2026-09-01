#!/usr/bin/env python3
"""Isolate Cycles memory: empty, HDRI, water volume, beech. No art changes."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy

import cinematic_component_recovery_v6 as v6
from cinematic_contextual_recovery_v7 import build_zoned_bed, load_lib
from cinematic_hero_rebuild_v5 import _dup_group
from cinematic_riverbank_v1 import WATER_Z
from cinematic_water_lock_v1 import test_cfg
from v7_resource_probe import scene_counts, snapshot

OUT = Path("/workspace/artifacts/tivvlejoy-scenery-showcase-30s/cinematic-contextual-recovery-v7")


def parse_args(argv):
    p = argparse.ArgumentParser()
    p.add_argument("--mode", required=True, choices=("empty", "hdri", "water", "beech"))
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv or [])
    v6.RENDER_RES = (64, 64)
    v6.reset_scene()
    scene = bpy.context.scene
    scene.cycles.use_denoising = False
    scene.cycles.samples = 1
    cfg = test_cfg("C")
    if args.mode in {"hdri", "water", "beech"}:
        v6.install_hdri(cfg["hdriRotZ"], strength=0.88)
    if args.mode == "water":
        col = v6._col("TJ_ISO")
        bounds = (-10.0, 6.5, -17.0, -2.5)
        water = v6.build_water_prism(col, bounds, name="TJ_ISO_Water")
        v6.apply_locked_water_material(water, cfg)
    if args.mode == "beech":
        col = v6._col("TJ_ISO")
        library = load_lib(("beech_a",))
        if library.get("beech_a"):
            _dup_group(library["beech_a"], (0.0, 0.0, 0.0), 7.4, 0.0, 0.0, col, "TJ_ISO_Beech")
    v6.add_camera("TJ_ISO_Cam", (2.0, -8.0, 2.0), (0.0, 0.0, 0.5), 40.0)
    before = snapshot("before", extra=scene_counts())
    dest = OUT / f"ISO_{args.mode}.png"
    scene.render.filepath = str(dest)
    try:
        bpy.ops.render.render(write_still=True)
        err = None
    except Exception as exc:  # noqa: BLE001
        err = f"{type(exc).__name__}:{exc}"
    after = snapshot("after", extra=scene_counts())
    payload = {
        "mode": args.mode,
        "beforeRss": before.get("rss"),
        "afterRss": after.get("rss"),
        "deltaRss": (after.get("rss") or 0) - (before.get("rss") or 0),
        "memAvailableAfter": after.get("memAvailable"),
        "error": err,
        "pngBytes": dest.stat().st_size if dest.is_file() else 0,
        "countsBefore": {k: before.get(k) for k in ("objects", "meshes", "images", "vertices")},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"ISO_{args.mode}.json").write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({"event": "iso_done", **payload}), flush=True)
    return 0 if err is None and payload["pngBytes"] > 0 else 2


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    raise SystemExit(main(argv))
