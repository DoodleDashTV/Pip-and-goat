#!/usr/bin/env python3
"""Stage-by-stage RSS probe for V7 Proof A. One Blender process. No full proof render."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy

import cinematic_component_recovery_v6 as v6
from cinematic_contextual_recovery_v7 import (
    build_zoned_bed,
    finish_rock,
    load_lib,
    plant_creek_bed_v2,
    plant_shoreline_v2,
)
from cinematic_hero_rebuild_v5 import ROCK_BLEND, ROCK_NAMES, _append_objects, _dup_group
from cinematic_riverbank_v1 import WATER_Z, point_on_south_shore, riverbank_sample
from cinematic_shoreline_v1 import transition_color
from cinematic_style_unifier_v2 import apply_style_unifier_v2
from cinematic_water_lock_v1 import test_cfg
from memory_safe_asset_loader_v1 import image_audit, inspect_library, purge_unused_datablocks
from v7_resource_probe import scene_counts, snapshot

OUT = Path("/workspace/artifacts/tivvlejoy-scenery-showcase-30s/cinematic-contextual-recovery-v7/MEMORY_STAGE_PROBE_V2.json")


def row(label: str, extra=None) -> dict:
    data = snapshot(label, extra={**(extra or {}), **scene_counts()})
    return data


def main() -> int:
    stages = []
    v6.RENDER_RES = (360, 640)
    v6.reset_scene()
    stages.append(row("empty"))

    cfg = test_cfg("C")
    v6.install_hdri(cfg["hdriRotZ"], strength=0.88)
    stages.append(row("hdri"))

    col = v6._col("TJ_MEMORY_STAGE")
    bounds = (-10.0, 6.5, -17.0, -2.5)

    def color_fn(x, y, z):
        return transition_color(x, y)

    v6.build_strip_terrain(col, "TJ_V7_BankTerrain", bounds, (100, 112), color_fn)
    stages.append(row("terrain"))

    build_zoned_bed(col, bounds, cfg)
    water = v6.build_water_prism(col, bounds, name="TJ_V7_Water")
    v6.apply_locked_water_material(water, cfg)
    stages.append(row("water"))

    library = load_lib(("festuca_a",))
    stages.append(row("grass", {"botaniqFiles": 1 if library.get("festuca_a") else 0}))

    library.update(load_lib(("fern_a",)))
    stages.append(row("fern"))

    library.update(load_lib(("beech_a",)))
    stages.append(row("beech"))

    rock_inspect = inspect_library(ROCK_BLEND)
    rocks = _append_objects(ROCK_BLEND, ROCK_NAMES)
    stages.append(row("rocks", {
        "rockRequested": len(ROCK_NAMES),
        "rockLoaded": len(rocks),
        "rockSourceImages": rock_inspect.get("imageCount"),
        "rockSourceObjects": rock_inspect.get("objectCount"),
    }))

    plant_shoreline_v2(col, rocks, library)
    plant_creek_bed_v2(col, rocks)
    if library.get("beech_a"):
        z, _ = riverbank_sample(-4.4, -3.8)
        _dup_group(library["beech_a"], (-4.4, -3.8, max(z, WATER_Z + 0.15)), 7.4, 0.35, 0.12, col, "TJ_V7_ReflectBeech")
    stages.append(row("shoreline"))

    apply_style_unifier_v2()
    stages.append(row("style"))

    purge = purge_unused_datablocks()
    stages.append(row("purge", {"purge": purge}))

    audit = image_audit()
    pre = row("pre_cycles", {"images": {"loadedCount": audit["loadedCount"], "estimatedRawBytes": audit["estimatedRawBytes"], "unreferencedCount": audit["unreferencedCount"], "largest10": audit["largest10"]}})
    stages.append(pre)

    # Force Cycles to synchronize without writing a proof still.
    scene = bpy.context.scene
    scene.render.resolution_x = 64
    scene.render.resolution_y = 64
    scene.cycles.samples = 1
    scene.render.filepath = "/tmp/tj_cycles_init_probe.png"
    try:
        bpy.ops.render.render(write_still=True)
        cycles_ok = True
        cycles_error = None
    except Exception as exc:  # noqa: BLE001 — probe must record the exact fail
        cycles_ok = False
        cycles_error = type(exc).__name__
    stages.append(row("cycles_initialized", {"cyclesOk": cycles_ok, "cyclesError": cycles_error}))

    deltas = []
    for i, stage in enumerate(stages):
        prev_rss = stages[i - 1]["rss"] if i else stage["rss"]
        deltas.append({
            "label": stage["label"],
            "rss": stage.get("rss"),
            "memAvailable": stage.get("memAvailable"),
            "deltaRss": (stage.get("rss") or 0) - (prev_rss or 0),
            "objects": stage.get("objects"),
            "meshes": stage.get("meshes"),
            "materials": stage.get("materials"),
            "images": stage.get("images") if isinstance(stage.get("images"), int) else stage.get("images"),
            "vertices": stage.get("vertices"),
        })
    largest = max(deltas[1:], key=lambda item: item["deltaRss"] or 0) if len(deltas) > 1 else None
    payload = {
        "schema": "TJ_MEMORY_STAGE_PROBE_V2",
        "stages": stages,
        "deltas": deltas,
        "largestJump": largest,
        "rockInspect": rock_inspect,
        "imageAudit": {
            "loadedCount": audit["loadedCount"],
            "estimatedRawBytes": audit["estimatedRawBytes"],
            "unreferencedCount": audit["unreferencedCount"],
            "largest10": audit["largest10"],
        },
        "purge": purge,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({"event": "stage_probe_done", "largest": largest, "out": str(OUT)}), flush=True)
    return 0 if cycles_ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
