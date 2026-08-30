#!/usr/bin/env python3
"""V7 contextual cinematic micro-vignettes. No full hero assembly.

Judges each component in the SHOT_02 role it will occupy.
Does not import cinematic_valley_world_v1 assemble. No paid compute.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
from mathutils import Vector

import cinematic_component_recovery_v6 as v6
from cinematic_creek_bed_v2 import ZONE_DEPTH, bed_slots, silt_pockets, zone_at
from cinematic_hero_rebuild_v5 import (
    BOTANIQ_SOURCES,
    ROCK_BLEND,
    ROCK_NAMES,
    _append_blend_group,
    _append_objects,
    _dup_group,
    _dup_mesh,
    _fit_scale,
    _largest_mesh,
)
from cinematic_hero_v3_land import channel_profile
from cinematic_meadow_v3 import meadow_v3_payload, meadow_v3_plan
from cinematic_riverbank_v1 import WATER_Z, point_on_south_shore, riverbank_sample
from cinematic_shoreline_v1 import transition_color
from cinematic_shoreline_v2 import gravel_scatter_plan, physical_slots, shoreline_v2_payload
from cinematic_style_unifier_v2 import apply_style_unifier_v2
from cinematic_water_lock_v1 import WATER_LOCK, test_cfg
from owned_building_audit import audit_summary

OUT_DEFAULT = Path("/workspace/artifacts/tivvlejoy-scenery-showcase-30s/cinematic-contextual-recovery-v7")


def _log(event: str, **payload) -> None:
    print(json.dumps({"event": event, **payload}), flush=True)


def setup(cfg, res=(540, 960)) -> None:
    v6.RENDER_RES = res
    v6.reset_scene()
    v6.install_hdri(cfg["hdriRotZ"], strength=0.88)
    v6.add_sun(cfg["sunEnergy"], cfg["sunEulerDeg"])
    v6.add_fill("TJ_V7_Sky", (4.0, -8.0, 14.0), 360.0, 12.0)
    v6.add_fill("TJ_V7_Bounce", (0.0, -12.0, 0.5), 200.0, 10.0, (0.84, 0.76, 0.60))


def finish_rock(obj, wet: bool = False) -> None:
    if obj is None:
        return
    v6.stamp_stone(obj, wet=wet)
    if obj.data and obj.data.users > 1:
        obj.data = obj.data.copy()
    if obj.modifiers.get("TJ_V7_RockSmooth") is None:
        sub = obj.modifiers.new("TJ_V7_RockSmooth", "SUBSURF")
        sub.levels = 1
        sub.render_levels = 1


def instance_one(src, loc, height: float, yaw: float, bury: float, col, name: str):
    if src is None:
        return None
    obj = src.copy()
    obj.data = src.data
    obj.parent = None
    obj.matrix_parent_inverse.identity()
    bpy.context.scene.collection.objects.link(obj)
    obj.hide_render = False
    obj.hide_viewport = False
    dim = max(float(src.dimensions.z), 0.05)
    scale = height / dim
    obj.scale = (scale, scale, scale)
    obj.rotation_euler = (obj.rotation_euler.x, obj.rotation_euler.y, obj.rotation_euler.z + yaw)
    obj.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lowest = min(c.z for c in corners)
    obj.location = (loc[0], loc[1], loc[2] - lowest - bury)
    obj.name = name
    v6._link(obj, col)
    return obj


def load_lib(keys) -> dict:
    library = {}
    for key in keys:
        path = BOTANIQ_SOURCES.get(key)
        if path is not None and path.exists():
            library[key] = _append_blend_group(path)
    return library


def src_mesh(library: dict, key: str):
    group = library.get(key) or []
    return _largest_mesh(group)


def plant_shoreline_v2(col, rocks, library) -> dict:
    planted = {"events": {}, "stones": 0, "veg": 0, "gravel": 0}
    festuca = src_mesh(library, "festuca_a") or src_mesh(library, "carex_a")
    fern = src_mesh(library, "fern_a")
    for i, (x, y, cue, scale, ev) in enumerate(physical_slots()):
        z, _ = riverbank_sample(x, y)
        planted["events"][ev] = planted["events"].get(ev, 0) + 1
        if cue in {"grass_root"} and festuca is not None:
            instance_one(festuca, (x, y, z), 0.55 + 0.35 * scale, 0.4 * i, 0.03, col, f"TJ_V7_Root_{i}")
            planted["veg"] += 1
        elif cue == "fern" and fern is not None:
            instance_one(fern, (x, y, z), 0.75 * scale, 0.5 * i, 0.02, col, f"TJ_V7_Fern_{i}")
            planted["veg"] += 1
        elif rocks:
            src = rocks[i % len(rocks)]
            fitted = _fit_scale(src, 1.65, scale)
            wet = cue in {"wet_soil", "fine_gravel", "submerged_stone", "underwater_gravel", "medium_stone"}
            obj = _dup_mesh(src, (x, y, z), fitted, 0.6 * i, 0.12 if "submerged" in cue or "under" in cue else 0.06, col, f"TJ_V7_{cue}_{i}")
            finish_rock(obj, wet=wet)
            planted["stones"] += 1
    for i, (x, y, radius, wet) in enumerate(gravel_scatter_plan(-2.0, 52)):
        z, _ = riverbank_sample(x, y)
        mesh = bpy.data.meshes.new(f"TJ_V7_Gravel_{i}")
        obj = bpy.data.objects.new(f"TJ_V7_Gravel_{i}", mesh)
        col.objects.link(obj)
        import bmesh

        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius)
        bm.to_mesh(mesh)
        bm.free()
        obj.location = (x, y, z + 0.008)
        obj.rotation_euler = (0.5 * (i % 4), 0.3 * (i % 3), 0.8 * i)
        finish_rock(obj, wet=wet)
        planted["gravel"] += 1
    return planted


def plant_creek_bed_v2(col, rocks) -> dict:
    planted = {"A": 0, "B": 0, "C": 0}
    for i, (x, y, klass, scale, zone) in enumerate(bed_slots()):
        if not rocks:
            break
        z, _ = riverbank_sample(x, y)
        target = WATER_Z - ZONE_DEPTH[zone]
        if zone == "A":
            z = min(z, target + 0.04)
        elif zone == "C":
            z = min(z, target)
        src = rocks[i % len(rocks)]
        fitted = _fit_scale(src, 1.65, scale)
        bury = 0.20 if klass == "medium" else 0.12
        obj = _dup_mesh(src, (x, y, z), fitted, 0.7 * i, bury, col, f"TJ_V7_Bed_{zone}_{i}")
        finish_rock(obj, wet=True)
        planted[zone] += 1
    return planted


def build_zoned_bed(col, bounds, cfg: dict):
    def z_fn(x, y):
        z, biome = riverbank_sample(x, y)
        zone = zone_at(x)
        target = WATER_Z - cfg.get("bedDepth", ZONE_DEPTH[zone])
        if biome in {"bed", "underwater"}:
            if zone == "A":
                return (z + (WATER_Z - ZONE_DEPTH["A"])) * 0.5
            if zone == "C":
                return min(z, WATER_Z - ZONE_DEPTH["C"])
            return (z + target) * 0.5
        return z

    albedo = cfg["bedAlbedo"]

    def color_fn(x, y, z):
        zone = zone_at(x)
        silt = 0.5 + 0.5 * math.sin(x * 3.0 + y * 2.2)
        gain = {"A": 1.12, "B": 1.0, "C": 0.78}[zone]
        r = albedo[0] * gain * (0.86 + 0.16 * silt)
        g = albedo[1] * gain * (0.86 + 0.14 * silt)
        b = albedo[2] * gain * (0.86 + 0.12 * silt)
        return (max(0.04, r), max(0.03, g), max(0.02, b), 1.0)

    return v6.build_strip_terrain(col, "TJ_V7_Bed", bounds, (64, 72), color_fn, z_fn)


def plant_meadow_v3(col, library, bounds, cap: int = 220) -> dict:
    plan = meadow_v3_plan(bounds)
    plan.sort(key=lambda item: (item["x"] - 2.05) ** 2 + (item["y"] + 21.6) ** 2)
    kept = []
    counts = {"foundation": 0, "medium": 0, "tall": 0, "fern_shrub": 0}
    for item in plan:
        role = item["role"]
        limit = 160 if role == "foundation" else 36
        if counts.get(role, 0) >= limit:
            continue
        kept.append(item)
        counts[role] = counts.get(role, 0) + 1
        if len(kept) >= cap:
            break
    planted = {k: 0 for k in counts}
    for i, item in enumerate(kept):
        key = item["species"]
        src = src_mesh(library, key) or src_mesh(library, "festuca_a") or src_mesh(library, "carex_a")
        if src is None:
            continue
        z, biome = riverbank_sample(item["x"], item["y"])
        if biome in {"bed", "underwater"}:
            continue
        instance_one(src, (item["x"], item["y"], z), item["height"], 0.29 * i, 0.02, col, f"TJ_V7_Meadow_{item['role']}_{i}")
        planted[item["role"]] = planted.get(item["role"], 0) + 1
    return {"planted": planted, "payload": meadow_v3_payload(kept)}


def plant_forest_edge(col, library) -> dict:
    planted = {"hero": 0, "support": 0, "under": 0}
    hero = library.get("beech_a") or library.get("beech_b")
    if hero:
        xy = point_on_south_shore(-5.2, offset=3.4)
        z, _ = riverbank_sample(xy[0], xy[1])
        _dup_group(hero, (xy[0], xy[1], max(z, WATER_Z + 0.1)), 8.0, 0.28, 0.12, col, "TJ_V7_HeroBeech")
        planted["hero"] += 1
    for i, (key, x, off, h, yaw) in enumerate((
        ("beech_b", -9.4, 4.2, 6.6, 1.1),
        ("beech_a", -12.2, 5.0, 7.2, -0.6),
        ("willow_a", 6.6, 4.8, 5.0, -0.9),
        ("hazel_a", -7.2, 2.4, 2.2, 0.5),
        ("hazel_b", 4.4, 2.8, 2.0, 1.4),
    )):
        group = library.get(key)
        if not group:
            continue
        xy = point_on_south_shore(x, offset=off)
        z, biome = riverbank_sample(xy[0], xy[1])
        if biome in {"bed", "underwater"}:
            continue
        _dup_group(group, (xy[0], xy[1], z), h, yaw, 0.10, col, f"TJ_V7_Edge_{key}_{i}")
        planted["support" if "beech" in key or "willow" in key else "under"] += 1
    return planted


def place_louis_intact(col) -> dict:
    loaded = v6.load_named(v6.LOUIS_GRASSY, ("LP_GrassyMountain1",))
    if not loaded:
        return {"intact": False, "clipped": False, "name": None}
    obj = loaded[0]
    # Sit far enough north that the foot is behind midground trees/terrain.
    v6.sit_louis(obj, -1.2, 46.0, scale=0.24, rot_z=0.10)
    v6._link(obj, col)
    obj.hide_render = False
    obj.hide_viewport = False
    return {"intact": True, "clipped": False, "name": obj.name, "baseStrategy": "occlude_do_not_delete"}


def place_cabin_midground(col) -> dict:
    loaded = v6.load_named(v6.CABIN, ("Building04_LOD0", "Roof04_LOD0"))
    target = Vector((-20.4, 16.8, 0.25))
    placed = []
    if loaded:
        cx = sum(o.location.x for o in loaded) / len(loaded)
        cy = sum(o.location.y for o in loaded) / len(loaded)
        cz = min(o.location.z for o in loaded)
        delta = target - Vector((cx, cy, cz))
        for obj in loaded:
            obj.location += delta
            v6._link(obj, col)
            obj.hide_render = False
            obj.hide_viewport = False
            placed.append(obj.name)
    return {"placed": placed, "target": [-20.4, 16.8], "role": "midground_support", **audit_summary()}


def creek_bank_vignette(out: Path, samples: int, which: str) -> dict:
    cfg = test_cfg(which)
    setup(cfg)
    col = v6._col("TJ_CREEK_BANK_VIGNETTE_V1")
    bounds = (-10.0, 6.5, -17.0, -2.5)

    def color_fn(x, y, z):
        return transition_color(x, y)

    v6.build_strip_terrain(col, "TJ_V7_BankTerrain", bounds, (100, 112), color_fn)
    build_zoned_bed(col, bounds, cfg)
    water = v6.build_water_prism(col, bounds, name="TJ_V7_Water")
    v6.apply_locked_water_material(water, cfg)
    rocks = _append_objects(ROCK_BLEND, ROCK_NAMES)
    library = load_lib(("festuca_a", "carex_a", "fern_a", "beech_a"))
    shore = plant_shoreline_v2(col, rocks, library)
    bed = plant_creek_bed_v2(col, rocks)
    foil = 0
    if cfg.get("treeFoil") and library.get("beech_a"):
        z, _ = riverbank_sample(-4.4, -3.8)
        _dup_group(library["beech_a"], (-4.4, -3.8, max(z, WATER_Z + 0.15)), 7.4, 0.35, 0.12, col, "TJ_V7_ReflectBeech")
        foil = 1
    style = apply_style_unifier_v2()
    sx, sy = point_on_south_shore(-2.0, offset=0.05)
    # Contextual creek role: bank + water + bed + one reflection mass.
    v6.add_camera("TJ_V7_CreekCam", (sx + 2.6, sy - 4.0, 1.48), (sx - 0.6, sy + 0.55, WATER_Z + 0.12), 40.0)
    tag = f"A_CREEK_BANK_{cfg['name']}"
    full = out / f"{tag}.png"
    v6.render_png(full, samples)
    phone = v6.phone_size(full, out / f"{tag}_PHONE.png")
    return {
        "proof": "A",
        "system": "TJ_CREEK_BANK_VIGNETTE_V1",
        "waterTest": cfg["name"],
        "lock": {k: cfg[k] for k in WATER_LOCK},
        "shore": shore,
        "bed": bed,
        "treeFoil": foil,
        "style": style,
        "shorelineV2": shoreline_v2_payload(),
        "path": str(full),
        "phone": str(phone),
    }


def meadow_forest_vignette(out: Path, samples: int) -> dict:
    cfg = test_cfg("C")
    setup(cfg)
    col = v6._col("TJ_MEADOW_FOREST_VIGNETTE_V1")
    bounds = (-12.0, 8.0, -20.0, -4.0)

    def color_fn(x, y, z):
        return (0.20, 0.24, 0.12, 1.0)

    def z_fn(x, y):
        z, biome = riverbank_sample(x, y)
        return z if biome not in {"bed", "underwater"} else WATER_Z + 0.10

    v6.build_strip_terrain(col, "TJ_V7_MeadowGround", bounds, (80, 88), color_fn, z_fn)
    library = load_lib(("festuca_a", "festuca_b", "carex_a", "carex_b", "fern_a", "beech_a", "beech_b", "willow_a", "hazel_a", "hazel_b"))
    meadow = plant_meadow_v3(col, library, (-7.0, 5.0, -18.0, -7.2), cap=200)
    forest = plant_forest_edge(col, library)
    style = apply_style_unifier_v2()
    # Across meadow toward the forest edge — not a tree on a plane, not sky-only.
    v6.add_camera("TJ_V7_MeadowCam", (2.15, -19.6, 2.15), (-4.2, -11.2, 1.35), 36.0)
    full = out / "B_MEADOW_FOREST.png"
    v6.render_png(full, samples)
    phone = v6.phone_size(full, out / "B_MEADOW_FOREST_PHONE.png")
    return {
        "proof": "B",
        "system": "TJ_MEADOW_FOREST_VIGNETTE_V1",
        "heroSpecies": "Fagus-sylvatica_A_summer",
        "willowRole": "support",
        "meadow": meadow,
        "forest": forest,
        "style": style,
        "path": str(full),
        "phone": str(phone),
    }


def mountain_depth_vignette(out: Path, samples: int) -> dict:
    cfg = test_cfg("C")
    setup(cfg)
    col = v6._col("TJ_MOUNTAIN_DEPTH_VIGNETTE_V1")

    def color_fn(x, y, z):
        return (0.22, 0.23, 0.13, 1.0)

    v6.build_strip_terrain(col, "TJ_V7_DepthGround", (-16.0, 12.0, -22.0, 18.0), (70, 90), color_fn)
    library = load_lib(("beech_a", "beech_b", "festuca_a", "fern_a"))
    if library.get("beech_a"):
        _dup_group(library["beech_a"], (-3.8, -12.5, 0.3), 7.6, 0.2, 0.10, col, "TJ_V7_FgBeech")
    if library.get("beech_b"):
        _dup_group(library["beech_b"], (-8.6, -6.4, 0.4), 6.4, 1.0, 0.10, col, "TJ_V7_MgBeech")
        _dup_group(library["beech_b"], (3.2, -5.2, 0.35), 5.8, -0.7, 0.10, col, "TJ_V7_MgBeech2")
    fest = src_mesh(library, "festuca_a")
    if fest is not None:
        for i, (x, y) in enumerate(((-2.2, -14.0), (1.4, -13.2), (-6.0, -10.5), (0.2, -8.8))):
            z, _ = riverbank_sample(x, y)
            instance_one(fest, (x, y, z), 0.7, 0.4 * i, 0.02, col, f"TJ_V7_DepthGrass_{i}")
    louis = place_louis_intact(col)
    style = apply_style_unifier_v2()
    world = bpy.context.scene.world
    if world and hasattr(world, "mist_settings"):
        world.mist_settings.use_mist = True
        world.mist_settings.start = 26.0
        world.mist_settings.depth = 72.0
        world.mist_settings.falloff = "QUADRATIC"
    v6.add_camera("TJ_V7_MtnCam", (2.40, -22.6, 4.40), (-1.4, 30.0, 9.6), 30.0)
    full = out / "C_MOUNTAIN_DEPTH.png"
    v6.render_png(full, samples)
    phone = v6.phone_size(full, out / "C_MOUNTAIN_DEPTH_PHONE.png")
    return {
        "proof": "C",
        "system": "TJ_MOUNTAIN_DEPTH_VIGNETTE_V1",
        "louis": louis,
        "style": style,
        "atmosphere": "restrained_mist_after_intact_geometry",
        "path": str(full),
        "phone": str(phone),
    }


def building_midground_vignette(out: Path, samples: int) -> dict:
    cfg = test_cfg("C")
    setup(cfg)
    col = v6._col("TJ_BUILDING_MIDGROUND_VIGNETTE_V1")

    def color_fn(x, y, z):
        return (0.21, 0.23, 0.12, 1.0)

    v6.build_strip_terrain(col, "TJ_V7_Yard", (-24.0, 10.0, -22.0, 20.0), (72, 86), color_fn)
    library = load_lib(("festuca_a", "carex_a", "beech_a", "beech_b"))
    plant_meadow_v3(col, library, (-6.0, 4.0, -18.0, -8.0), cap=90)
    if library.get("beech_a"):
        _dup_group(library["beech_a"], (-16.8, 10.4, 0.4), 7.0, 0.4, 0.12, col, "TJ_V7_CabinTreeL")
    if library.get("beech_b"):
        _dup_group(library["beech_b"], (-23.2, 14.6, 0.5), 6.2, -0.5, 0.12, col, "TJ_V7_CabinTreeR")
    cabin = place_cabin_midground(col)
    place_louis_intact(col)
    style = apply_style_unifier_v2()
    # SHOT_02 camera A — look at the creek/meadow, not the cabin.
    v6.add_camera("TJ_V7_Shot02Cam", (2.10, -21.45, 3.02), (-3.45, -10.7, 1.32), 34.0)
    full = out / "D_BUILDING_MIDGROUND.png"
    v6.render_png(full, samples)
    phone = v6.phone_size(full, out / "D_BUILDING_MIDGROUND_PHONE.png")
    return {
        "proof": "D",
        "system": "TJ_BUILDING_MIDGROUND_VIGNETTE_V1",
        "cabin": cabin,
        "style": style,
        "path": str(full),
        "phone": str(phone),
    }


def parse_args(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--proof", default="all", choices=("A", "B", "C", "D", "all"))
    p.add_argument("--water-test", default="all", choices=("A", "B", "C", "all"))
    p.add_argument("--output-dir", default=str(OUT_DEFAULT))
    p.add_argument("--samples", type=int, default=32)
    p.add_argument("--resolution", default="540x960")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    v6.RENDER_RES = tuple(int(x) for x in args.resolution.lower().split("x"))
    results = []
    wanted = ["A", "B", "C", "D"] if args.proof == "all" else [args.proof]
    for name in wanted:
        _log("proof_start", name=name)
        if name == "A":
            tests = ("A", "B", "C") if args.water_test == "all" else (args.water_test,)
            for t in tests:
                results.append(creek_bank_vignette(out, args.samples, t))
        elif name == "B":
            results.append(meadow_forest_vignette(out, args.samples))
        elif name == "C":
            results.append(mountain_depth_vignette(out, args.samples))
        elif name == "D":
            results.append(building_midground_vignette(out, args.samples))
    receipt = {
        "schema": "TIVVLEJOY_CONTEXTUAL_RECOVERY_V7",
        "fullHeroAssembled": False,
        "paidCreate": 0,
        "livePods": [],
        "resolution": args.resolution,
        "samples": args.samples,
        "results": results,
    }
    (out / "CONTEXTUAL_RECOVERY_V7.json").write_text(json.dumps(receipt, indent=2) + "\n")
    _log("contextual_recovery_done", count=len(results), out=str(out))
    return 0


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    raise SystemExit(main(argv))
