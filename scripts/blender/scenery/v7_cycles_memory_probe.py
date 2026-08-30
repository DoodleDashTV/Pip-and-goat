#!/usr/bin/env python3
"""Measure Cycles sync cost. Does not change V7 art direction."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy

import cinematic_component_recovery_v6 as v6
from cinematic_contextual_recovery_v7 import build_zoned_bed, load_lib, plant_creek_bed_v2, plant_shoreline_v2
from cinematic_hero_rebuild_v5 import ROCK_BLEND, ROCK_NAMES, _append_objects, _dup_group
from cinematic_riverbank_v1 import WATER_Z, riverbank_sample
from cinematic_shoreline_v1 import transition_color
from cinematic_style_unifier_v2 import apply_style_unifier_v2
from cinematic_water_lock_v1 import test_cfg
from v7_resource_probe import scene_counts, snapshot

OUT = Path("/workspace/artifacts/tivvlejoy-scenery-showcase-30s/cinematic-contextual-recovery-v7")


def parse_args(argv):
    p = argparse.ArgumentParser()
    p.add_argument("--denoise", action="store_true")
    p.add_argument("--subdiv-render", type=int, default=1)
    p.add_argument("--tag", default="cycles")
    return p.parse_args(argv)


def build_scene():
    v6.RENDER_RES = (64, 64)
    v6.reset_scene()
    cfg = test_cfg("C")
    v6.install_hdri(cfg["hdriRotZ"], strength=0.88)
    col = v6._col("TJ_CYCLES_MEM")
    bounds = (-10.0, 6.5, -17.0, -2.5)

    def color_fn(x, y, z):
        return transition_color(x, y)

    v6.build_strip_terrain(col, "TJ_V7_BankTerrain", bounds, (100, 112), color_fn)
    build_zoned_bed(col, bounds, cfg)
    water = v6.build_water_prism(col, bounds, name="TJ_V7_Water")
    v6.apply_locked_water_material(water, cfg)
    rocks = _append_objects(ROCK_BLEND, ROCK_NAMES)
    library = load_lib(("festuca_a", "carex_a", "fern_a", "beech_a"))
    plant_shoreline_v2(col, rocks, library)
    plant_creek_bed_v2(col, rocks)
    if library.get("beech_a"):
        z, _ = riverbank_sample(-4.4, -3.8)
        _dup_group(library["beech_a"], (-4.4, -3.8, max(z, WATER_Z + 0.15)), 7.4, 0.35, 0.12, col, "TJ_V7_ReflectBeech")
    apply_style_unifier_v2()
    v6.add_camera("TJ_V7_MemCam", (0.0, -16.0, 1.6), (-2.0, -10.0, 0.2), 40.0)
    return rocks


def apply_subdiv_render(level: int) -> int:
    touched = 0
    for obj in bpy.data.objects:
        for mod in obj.modifiers:
            if mod.type == "SUBSURF":
                mod.render_levels = level
                touched += 1
    return touched


def mesh_report() -> list[dict]:
    rows = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.data is None:
            continue
        subdiv = [mod.render_levels for mod in obj.modifiers if mod.type == "SUBSURF"]
        rows.append({
            "name": obj.name,
            "verts": len(obj.data.vertices),
            "faces": len(obj.data.polygons),
            "subdivRender": subdiv,
        })
    rows.sort(key=lambda item: item["verts"], reverse=True)
    return rows[:20]


def main(argv=None) -> int:
    args = parse_args(argv or [])
    build_scene()
    subdiv_n = apply_subdiv_render(args.subdiv_render)
    scene = bpy.context.scene
    scene.cycles.use_denoising = bool(args.denoise)
    scene.cycles.samples = 1
    scene.render.resolution_x = 64
    scene.render.resolution_y = 64
    before = snapshot("before_cycles", extra={"subdivMods": subdiv_n, **scene_counts()})
    meshes = mesh_report()
    dest = OUT / f"CYCLES_MEM_{args.tag}.png"
    scene.render.filepath = str(dest)
    try:
        bpy.ops.render.render(write_still=True)
        err = None
    except Exception as exc:  # noqa: BLE001
        err = f"{type(exc).__name__}:{exc}"
    after = snapshot("after_cycles", extra=scene_counts())
    payload = {
        "tag": args.tag,
        "denoise": bool(args.denoise),
        "subdivRender": args.subdiv_render,
        "subdivMods": subdiv_n,
        "before": before,
        "after": after,
        "deltaRss": (after.get("rss") or 0) - (before.get("rss") or 0),
        "error": err,
        "pngBytes": dest.stat().st_size if dest.is_file() else 0,
        "topMeshes": meshes,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"CYCLES_MEM_{args.tag}.json").write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({"event": "cycles_mem_done", "tag": args.tag, "deltaRss": payload["deltaRss"], "error": err}), flush=True)
    return 0 if err is None else 2


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    raise SystemExit(main(argv))
