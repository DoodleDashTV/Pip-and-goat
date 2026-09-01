#!/usr/bin/env python3
"""V3 Cycles-sync root-cause harness. One component set per Blender process.

Does not change V7 art systems. 64x64 / 1 sample / denoise off.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
from mathutils import Vector

import cinematic_component_recovery_v6 as v6
from cinematic_contextual_recovery_v7 import (
    build_zoned_bed,
    finish_rock,
    load_lib,
    plant_creek_bed_v2,
    plant_shoreline_v2,
    src_mesh,
)
from cinematic_hero_rebuild_v5 import ROCK_BLEND, ROCK_NAMES, _append_objects, _dup_group, _dup_mesh, _fit_scale
from cinematic_riverbank_v1 import WATER_Z, riverbank_sample
from cinematic_shoreline_v1 import transition_color
from cinematic_shoreline_v2 import gravel_scatter_plan
from cinematic_water_lock_v1 import test_cfg
from memory_safe_asset_loader_v1 import exclude_hidden_library_masters, image_audit, is_hidden_library_master
from v7_resource_probe import scene_counts, snapshot

OUT = Path("/workspace/artifacts/tivvlejoy-scenery-showcase-30s/cycles-sync-root-cause-v3")
PARTS = (
    "empty", "hdri", "terrain", "water", "bed", "gravel", "rocks",
    "grass", "fern", "beech", "shore", "lights",
)


def parse_args(argv):
    p = argparse.ArgumentParser()
    p.add_argument("--tag", required=True)
    p.add_argument("--parts", default="empty")
    p.add_argument("--lib-mode", default="park", choices=("park", "exclude", "unlink"))
    p.add_argument("--subdiv", default="all", choices=("all", "none", "closest"))
    p.add_argument("--hdri-mode", default="full", choices=("none", "full", "down4k"))
    p.add_argument("--eval-geom", action="store_true")
    p.add_argument("--beech-audit", action="store_true")
    return p.parse_args(argv)


def hwm() -> int | None:
    try:
        for line in Path("/proc/self/status").read_text().splitlines():
            if line.startswith("VmHWM:"):
                return int(line.split()[1]) * 1024
    except OSError:
        return None
    return None


def cycles_config() -> dict:
    scene = bpy.context.scene
    cyc = scene.cycles
    keys = (
        "device", "feature_set", "use_denoising", "use_persistent_data",
        "tile_size", "use_auto_tile", "max_bounces", "transparent_max_bounces",
        "transmission_bounces", "volume_bounces", "use_motion_blur",
        "use_adaptive_sampling", "use_light_tree", "debug_use_spatial_splits",
        "debug_use_compact_bvh", "debug_use_hair_bvh", "use_camera_cull",
        "use_distance_cull", "dicing_rate", "max_subdivisions",
    )
    out = {"engine": scene.render.engine, "resolution": [scene.render.resolution_x, scene.render.resolution_y]}
    for key in keys:
        if hasattr(cyc, key):
            try:
                out[key] = getattr(cyc, key)
            except Exception:
                out[key] = "unreadable"
    if hasattr(scene.render, "use_persistent_data"):
        out["use_persistent_data"] = bool(scene.render.use_persistent_data)
    if hasattr(scene.render, "film_transparent"):
        out["film_transparent"] = bool(scene.render.film_transparent)
    return out


def unlink_library_masters() -> dict:
    removed = []
    for obj in list(bpy.data.objects):
        if is_hidden_library_master(
            hide_render=bool(obj.hide_render),
            name=obj.name,
            is_lib_flag=bool(obj.get("tj_v5_lib")),
            is_visible_instance=bool(obj.get("tj_v5")) or obj.name.startswith("TJ_"),
        ):
            bpy.data.objects.remove(obj, do_unlink=True)
            removed.append(obj.name)
    return {"unlinked": removed}


def apply_subdiv_policy(policy: str) -> dict:
    touched = []
    visible = [obj for obj in bpy.data.objects if obj.type == "MESH" and not obj.hide_render]
    visible.sort(key=lambda obj: (obj.location - Vector((0.0, -16.0, 1.6))).length)
    closest = {obj.name for obj in visible[:3]}
    for obj in bpy.data.objects:
        for mod in obj.modifiers:
            if mod.type != "SUBSURF":
                continue
            if policy == "none":
                mod.show_render = False
                mod.render_levels = 0
                touched.append(obj.name)
            elif policy == "closest":
                if obj.name not in closest:
                    mod.show_render = False
                    mod.render_levels = 0
                    touched.append(obj.name)
    return {"policy": policy, "touched": touched}


def diagnostic_hdri_4k() -> Path:
    src = v6.HDRI
    dest = Path("/tmp/tj_hdri_diag_4k.jpg")
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    from PIL import Image

    im = Image.open(src).convert("RGB")
    im = im.resize((4096, 2048), Image.Resampling.LANCZOS)
    im.save(dest, quality=92)
    return dest


def install_world(mode: str, cfg) -> str:
    if mode == "none":
        world = bpy.data.worlds.new("TJ_NEUTRAL")
        world.use_nodes = True
        nodes = world.node_tree.nodes
        links = world.node_tree.links
        nodes.clear()
        bg = nodes.new("ShaderNodeBackground")
        bg.inputs["Color"].default_value = (0.18, 0.20, 0.24, 1.0)
        bg.inputs["Strength"].default_value = 0.35
        out = nodes.new("ShaderNodeOutputWorld")
        links.new(bg.outputs["Background"], out.inputs["Surface"])
        bpy.context.scene.world = world
        return "neutral"
    if mode == "down4k":
        path = diagnostic_hdri_4k()
        original = v6.HDRI
        v6.HDRI = path
        try:
            v6.install_hdri(cfg["hdriRotZ"], strength=0.88)
        finally:
            v6.HDRI = original
        return str(path)
    return v6.install_hdri(cfg["hdriRotZ"], strength=0.88)


def plant_rocks_only(col, rocks) -> int:
    n = 0
    for i, src in enumerate(rocks):
        x = -3.2 + (i % 4) * 1.1
        y = -9.4 + (i // 4) * 1.4
        z, _ = riverbank_sample(x, y)
        fitted = _fit_scale(src, 1.65, 1.0)
        obj = _dup_mesh(src, (x, y, z), fitted, 0.45 * i, 0.08, col, f"TJ_V3_Rock_{i}")
        finish_rock(obj, wet=False)
        n += 1
    return n


def plant_gravel_only(col) -> int:
    n = 0
    for i, (x, y, radius, wet) in enumerate(gravel_scatter_plan(-2.0, 52)):
        z, _ = riverbank_sample(x, y)
        mesh = bpy.data.meshes.new(f"TJ_V3_Gravel_{i}")
        obj = bpy.data.objects.new(f"TJ_V3_Gravel_{i}", mesh)
        col.objects.link(obj)
        import bmesh

        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius)
        bm.to_mesh(mesh)
        bm.free()
        obj.location = (x, y, z + 0.008)
        finish_rock(obj, wet=wet)
        n += 1
    return n


def modifier_audit() -> list[dict]:
    rows = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.modifiers:
            continue
        rows.append({
            "name": obj.name,
            "hide_render": bool(obj.hide_render),
            "baseVerts": len(obj.data.vertices) if obj.data else 0,
            "baseFaces": len(obj.data.polygons) if obj.data else 0,
            "modifiers": [
                {
                    "type": mod.type,
                    "name": mod.name,
                    "show_viewport": getattr(mod, "show_viewport", None),
                    "show_render": getattr(mod, "show_render", None),
                    "levels": getattr(mod, "levels", None),
                    "render_levels": getattr(mod, "render_levels", None),
                }
                for mod in obj.modifiers
            ],
        })
    return rows


def instance_audit() -> dict:
    meshes = []
    for mesh in bpy.data.meshes:
        users = [obj.name for obj in bpy.data.objects if obj.data == mesh]
        meshes.append({"mesh": mesh.name, "verts": len(mesh.vertices), "users": len(users), "objects": users[:12]})
    meshes.sort(key=lambda item: item["users"], reverse=True)
    return {
        "uniqueMeshes": len(bpy.data.meshes),
        "objects": len(bpy.data.objects),
        "shared": [row for row in meshes if row["users"] > 1][:20],
        "singleUser": sum(1 for row in meshes if row["users"] == 1),
    }


def hidden_master_audit() -> dict:
    rows = []
    vl_names = {obj.name for obj in bpy.context.view_layer.objects}
    for obj in bpy.data.objects:
        if obj.get("tj_v5_lib") or (obj.hide_render and obj.type == "MESH"):
            visible = None
            try:
                visible = bool(obj.visible_get())
            except Exception:
                visible = None
            rows.append({
                "name": obj.name,
                "hide_render": bool(obj.hide_render),
                "hide_viewport": bool(obj.hide_viewport),
                "collections": [col.name for col in obj.users_collection],
                "inViewLayer": obj.name in vl_names,
                "visibleGet": visible,
                "isLibFlag": bool(obj.get("tj_v5_lib")),
                "isInstanceFlag": bool(obj.get("tj_v5")),
                "verts": len(obj.data.vertices) if obj.type == "MESH" and obj.data else 0,
            })
    return {"hiddenMeshObjects": rows, "count": len(rows)}


def safe_eval_geom(limit_objects: int = 8) -> dict:
    before = snapshot("eval_geom_before")
    visible = [obj for obj in bpy.data.objects if obj.type == "MESH" and not obj.hide_render]
    if len(visible) > limit_objects:
        return {"skipped": True, "reason": "too_many_visible_meshes", "visible": len(visible)}
    try:
        dg = bpy.context.evaluated_depsgraph_get()
    except Exception as exc:  # noqa: BLE001
        after = snapshot("eval_geom_failed")
        return {"ok": False, "error": type(exc).__name__, "rssBefore": before.get("rss"), "rssAfter": after.get("rss")}
    rows = []
    ev_verts = 0
    ev_faces = 0
    for obj in visible:
        try:
            ev = obj.evaluated_get(dg)
            mesh = ev.to_mesh()
            v = len(mesh.vertices)
            f = len(mesh.polygons)
            ev.to_mesh_clear()
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"{obj.name}:{type(exc).__name__}", "rssBefore": before.get("rss")}
        ev_verts += v
        ev_faces += f
        rows.append({"name": obj.name, "evalVerts": v, "evalFaces": f, "baseVerts": len(obj.data.vertices)})
    after = snapshot("eval_geom_after")
    jump = (after.get("rss") or 0) - (before.get("rss") or 0)
    return {
        "ok": True,
        "objects": rows,
        "evalVerts": ev_verts,
        "evalFaces": ev_faces,
        "rssBefore": before.get("rss"),
        "rssAfter": after.get("rss"),
        "rssJump": jump,
        "aborted": jump > 3 * 1024 * 1024 * 1024,
    }


def beech_deep_audit(library: dict) -> dict:
    group = library.get("beech_a") or []
    obj = src_mesh(library, "beech_a")
    if obj is None:
        return {"found": False}
    mats = []
    alpha = False
    blend = []
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None:
            continue
        info = {"name": mat.name, "blend": getattr(mat, "blend_method", None), "shadow": getattr(mat, "shadow_method", None)}
        if info["blend"] and str(info["blend"]).upper() not in {"OPAQUE", "NONE"}:
            alpha = True
        blend.append(info)
        mats.append(info)
    gn = [mod.type for mod in obj.modifiers]
    leaf_faces = 0
    bark_faces = 0
    other_faces = 0
    if obj.data:
        for poly in obj.data.polygons:
            slot = obj.material_slots[poly.material_index] if poly.material_index < len(obj.material_slots) else None
            mat_name = slot.material.name if slot and slot.material else ""
            low = mat_name.lower()
            if "leaf" in low:
                leaf_faces += 1
            elif "bark" in low:
                bark_faces += 1
            else:
                other_faces += 1
    shape_keys = 0
    if obj.data and getattr(obj.data, "shape_keys", None) and obj.data.shape_keys.key_blocks:
        shape_keys = len(obj.data.shape_keys.key_blocks)
    return {
        "found": True,
        "name": obj.name,
        "type": obj.type,
        "baseVerts": len(obj.data.vertices) if obj.data else 0,
        "baseFaces": len(obj.data.polygons) if obj.data else 0,
        "leafFaces": leaf_faces,
        "barkFaces": bark_faces,
        "otherFaces": other_faces,
        "shapeKeys": shape_keys,
        "modifiers": gn,
        "hasGeometryNodes": "NODES" in gn,
        "hasSubdivision": "SUBSURF" in gn,
        "hasDisplace": "DISPLACE" in gn,
        "materials": mats,
        "alphaLikely": alpha,
        "libraryGroupSize": len(group),
        "hide_render": bool(obj.hide_render),
        "users": int(obj.data.users) if obj.data else 0,
    }


def build(parts, args, cfg):
    col = v6._col("TJ_V3_ISO")
    bounds = (-10.0, 6.5, -17.0, -2.5)
    rocks = []
    library = {}
    if "hdri" in parts and args.hdri_mode != "none":
        install_world(args.hdri_mode, cfg)
    elif args.hdri_mode == "none" or "hdri" not in parts:
        install_world("none", cfg)
    if "lights" in parts:
        v6.add_sun(cfg["sunEnergy"], cfg["sunEulerDeg"])
        v6.add_fill("TJ_V3_Sky", (4.0, -8.0, 14.0), 360.0, 12.0)
    if "terrain" in parts:
        def color_fn(x, y, z):
            return transition_color(x, y)
        v6.build_strip_terrain(col, "TJ_V7_BankTerrain", bounds, (100, 112), color_fn)
    if "bed" in parts:
        build_zoned_bed(col, bounds, cfg)
    if "water" in parts:
        water = v6.build_water_prism(col, bounds, name="TJ_V7_Water")
        v6.apply_locked_water_material(water, cfg)
    if "rocks" in parts:
        rocks = _append_objects(ROCK_BLEND, ROCK_NAMES)
        if "shore" not in parts:
            plant_rocks_only(col, rocks)
    plant_keys = tuple(k for k in ("grass", "fern", "beech") if k in parts)
    key_map = {"grass": "festuca_a", "fern": "fern_a", "beech": "beech_a"}
    if plant_keys:
        library = load_lib(tuple(key_map[k] for k in plant_keys))
    if "gravel" in parts and "shore" not in parts:
        plant_gravel_only(col)
    if "shore" in parts:
        plant_shoreline_v2(col, rocks, library)
        if rocks:
            plant_creek_bed_v2(col, rocks)
    if "beech" in parts and library.get("beech_a") and "shore" not in parts:
        z, _ = riverbank_sample(-4.4, -3.8)
        _dup_group(library["beech_a"], (-4.4, -3.8, max(z, WATER_Z + 0.15)), 7.4, 0.35, 0.12, col, "TJ_V7_ReflectBeech")
    if args.lib_mode == "exclude":
        exclude_hidden_library_masters()
    elif args.lib_mode == "unlink":
        unlink_library_masters()
    apply_subdiv_policy(args.subdiv)
    v6.add_camera("TJ_V3_Cam", (2.6, -16.0, 1.48), (-0.6, -10.7, WATER_Z + 0.12), 40.0)
    return rocks, library


def main(argv=None) -> int:
    args = parse_args(argv or [])
    parts = [p.strip() for p in args.parts.split(",") if p.strip()]
    v6.RENDER_RES = (64, 64)
    v6.reset_scene()
    scene = bpy.context.scene
    scene.cycles.use_denoising = False
    scene.cycles.samples = 1
    scene.render.resolution_x = 64
    scene.render.resolution_y = 64
    cfg = test_cfg("C")
    empty = snapshot("empty")
    rocks, library = build(parts, args, cfg)
    before = snapshot("before_cycles", extra=scene_counts())
    audit_images = image_audit()
    mods = modifier_audit()
    hidden = hidden_master_audit()
    inst = instance_audit()
    beech = beech_deep_audit(library) if args.beech_audit else None
    eval_geom = safe_eval_geom() if args.eval_geom else None
    if eval_geom and eval_geom.get("aborted"):
        payload = {"tag": args.tag, "aborted": "EVAL_GEOM_MEMORY_JUMP", "eval": eval_geom}
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / f"{args.tag}.json").write_text(json.dumps(payload, indent=2) + "\n")
        print(json.dumps({"event": "aborted_eval_geom", "tag": args.tag}), flush=True)
        return 3
    dest = OUT / f"{args.tag}.png"
    scene.render.filepath = str(dest)
    err = None
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as exc:  # noqa: BLE001
        err = f"{type(exc).__name__}:{exc}"
    after = snapshot("after_cycles", extra=scene_counts())
    payload = {
        "schema": "TJ_CYCLES_SYNC_DECOMPOSE_V3",
        "tag": args.tag,
        "parts": parts,
        "libMode": args.lib_mode,
        "subdiv": args.subdiv,
        "hdriMode": args.hdri_mode,
        "cycles": cycles_config(),
        "emptyRss": empty.get("rss"),
        "before": before,
        "after": after,
        "hwm": hwm(),
        "deltaRss": (after.get("rss") or 0) - (before.get("rss") or 0),
        "peakFromHwm": hwm(),
        "error": err,
        "pngBytes": dest.stat().st_size if dest.is_file() else 0,
        "png": dest.is_file() and dest.stat().st_size > 0,
        "images": {
            "count": audit_images.get("loadedCount"),
            "rawBytes": audit_images.get("estimatedRawBytes"),
            "largest": audit_images.get("largest10"),
        },
        "modifiers": mods,
        "hiddenMasters": hidden,
        "instances": inst,
        "beech": beech,
        "evalGeom": eval_geom,
        "counts": scene_counts(),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{args.tag}.json").write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({
        "event": "v3_done",
        "tag": args.tag,
        "hwm": payload["hwm"],
        "before": before.get("rss"),
        "after": after.get("rss"),
        "png": payload["png"],
        "error": err,
    }), flush=True)
    return 0 if err is None and payload["png"] else 2


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    raise SystemExit(main(argv))
