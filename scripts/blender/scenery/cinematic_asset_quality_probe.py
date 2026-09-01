#!/usr/bin/env python3
"""Small local quality probes. No SHOT_02 rebuild. No paid compute.

Modes:
  inspect   — list objects/materials from a recovered .blend
  vegetation — one hero tree, one support tree, one shrub, one grass group
  cabin     — highest-quality Village cabin with ALB/NRM/SPE
  meadow    — grass/ground-cover clump test if a volumetric source exists
  mountains — inspect 3DT vs Louis object names only (no Louis restyle)
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def _log(event: str, **payload) -> None:
    print(json.dumps({"event": event, **payload}), flush=True)


def _clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for datablock in (bpy.data.objects, bpy.data.collections, bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(datablock):
            datablock.remove(item)


def _setup_look(samples: int, resolution: tuple[int, int]) -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Base Contrast"
    except TypeError:
        pass
    world = bpy.data.worlds.new("TJ_V4_PROBE_WORLD")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    bg = nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (0.46, 0.58, 0.72, 1.0)
    bg.inputs["Strength"].default_value = 0.85
    out = nodes.new("ShaderNodeOutputWorld")
    links.new(bg.outputs["Background"], out.inputs["Surface"])
    sun = bpy.data.objects.new("TJ_V4_SUN", bpy.data.lights.new("TJ_V4_SUN", "SUN"))
    sun.data.energy = 3.4
    sun.data.angle = math.radians(6.5)
    sun.data.color = (1.0, 0.92, 0.78)
    sun.rotation_euler = (math.radians(44.0), math.radians(10.0), math.radians(32.0))
    scene.collection.objects.link(sun)
    fill = bpy.data.objects.new("TJ_V4_FILL", bpy.data.lights.new("TJ_V4_FILL", "AREA"))
    fill.data.energy = 280.0
    fill.data.size = 8.0
    fill.location = (2.0, -6.0, 4.5)
    scene.collection.objects.link(fill)


def _append_objects(blend: Path, names: list[str]) -> list:
    if not blend.exists():
        _log("probe_blend_missing", path=str(blend))
        return []
    with bpy.data.libraries.load(str(blend), link=False) as (src, dst):
        available = list(src.objects or [])
        chosen = [name for name in names if name in available]
        dst.objects = chosen
        dst.images = list(src.images or [])
        _log("probe_append", blend=blend.name, requested=names, chosen=chosen, available=len(available))
    loaded = []
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_parent_inverse.identity()
        obj.matrix_world = world
        loaded.append(obj)
    return loaded


def _inspect_object(obj) -> dict:
    mesh = obj.data if obj.type == "MESH" else None
    verts = len(mesh.vertices) if mesh else 0
    faces = len(mesh.polygons) if mesh else 0
    dims = [round(float(v), 3) for v in obj.dimensions]
    thin = False
    if dims:
        mx = max(dims)
        mn = min(d for d in dims if d > 1e-6) if any(d > 1e-6 for d in dims) else 0.001
        thin = mx > 0.2 and (mn / mx) < 0.08 and verts <= 80
    mats = [slot.material.name if slot.material else None for slot in obj.material_slots]
    return {
        "name": obj.name,
        "verts": verts,
        "faces": faces,
        "dims": dims,
        "thinCardLikely": thin,
        "materials": mats,
        "modifiers": [mod.type for mod in obj.modifiers],
    }


def inspect_blend(blend: Path, out: Path, want: list[str] | None = None) -> dict:
    _clear_scene()
    with bpy.data.libraries.load(str(blend), link=False) as (src, dst):
        objects = list(src.objects or [])
        collections = list(src.collections or [])
        materials = list(src.materials or [])
        images = list(src.images or [])
        chosen = [name for name in (want or objects[:40]) if name in objects][:40]
        dst.objects = chosen
    samples = [_inspect_object(obj) for obj in bpy.data.objects if obj.type == "MESH"]
    payload = {
        "blend": str(blend),
        "bytes": blend.stat().st_size,
        "objectCount": len(objects),
        "collectionCount": len(collections),
        "materialCount": len(materials),
        "imageCount": len(images),
        "objectNames": objects[:80],
        "collectionNames": collections[:40],
        "samples": samples,
    }
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    _log("inspect_written", path=str(out), objects=len(objects))
    return payload


def _place(obj, location, target_height: float) -> None:
    dim = max(float(obj.dimensions.z), 0.01)
    obj.scale = [target_height / dim] * 3
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    lowest = min(c.z for c in corners)
    obj.location = (location[0], location[1], location[2] - lowest)


def _camera(location, look, lens=50.0):
    cam = bpy.data.objects.new("TJ_V4_CAM", bpy.data.cameras.new("TJ_V4_CAM"))
    cam.location = location
    cam.data.lens = lens
    cam.data.sensor_width = 36.0
    direction = Vector(look) - Vector(location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def _ground():
    bpy.ops.mesh.primitive_plane_add(size=18.0, location=(0.0, 0.0, 0.0))
    ground = bpy.context.active_object
    ground.name = "TJ_V4_GROUND"
    mat = bpy.data.materials.new("TJ_V4_GROUND")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.22, 0.28, 0.16, 1.0)
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.82
    ground.data.materials.append(mat)
    return ground


def _render(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    _log("probe_rendered", path=str(path))


def _largest_mesh(objs: list):
    meshes = [obj for obj in objs if obj.type == "MESH"]
    if not meshes:
        return None
    return max(meshes, key=lambda obj: len(obj.data.vertices) if obj.data else 0)


def vegetation_probe(sources: list[Path], out_dir: Path) -> dict:
    _clear_scene()
    _setup_look(96, (1080, 1080))
    _ground()
    roles = ("hero_tree", "support_tree", "shrub_fern", "grass", "ground_cover")
    heights = (7.2, 5.2, 1.35, 0.7, 0.28)
    locations = ((-1.6, 0.8, 0.0), (2.0, 1.6, 0.0), (-0.15, -1.55, 0.0), (0.85, -1.15, 0.0), (1.35, -0.35, 0.0))
    planted = []
    for i, blend in enumerate(sources[:5]):
        before = set(bpy.data.objects.keys())
        with bpy.data.libraries.load(str(blend), link=False) as (src, dst):
            dst.objects = list(src.objects or [])
            dst.images = list(src.images or [])
        loaded = [bpy.data.objects[name] for name in bpy.data.objects.keys() if name not in before]
        for obj in loaded:
            if obj.name not in bpy.context.scene.collection.objects:
                bpy.context.scene.collection.objects.link(obj)
            obj.hide_render = False
            obj.hide_viewport = False
        hero = _largest_mesh(loaded)
        if hero is None:
            continue
        for obj in loaded:
            if obj != hero:
                obj.hide_render = True
                obj.hide_viewport = True
        role = roles[i]
        _place(hero, locations[i], heights[i])
        planted.append({"role": role, "source": blend.name, **_inspect_object(hero)})
    _camera((0.35, -11.5, 3.4), (0.2, 0.4, 2.4), lens=35.0)
    still = out_dir / "VEGETATION_QUALITY_CROP.png"
    _render(still)
    cards = [item for item in planted if item.get("thinCardLikely")]
    botaniq = any("bq_" in item.get("source", "") for item in planted)
    high_volume = all(
        item["verts"] >= 400
        for item in planted
        if item["role"] in {"hero_tree", "support_tree"}
    )
    verdict = {
        "sources": [str(p) for p in sources],
        "planted": planted,
        "cardsVisibleLikely": bool(cards),
        "cardNames": [item["name"] for item in cards],
        "still": str(still),
        "foregroundSuitable": bool(botaniq and high_volume and not any(item["role"] == "hero_tree" and item["thinCardLikely"] for item in planted)),
        "status": "VEGETATION_SOURCE_BLOCKER_RESOLVED" if botaniq and high_volume else "VEGETATION_ASSET_UPGRADE_REQUIRED",
    }
    (out_dir / "VEGETATION_QUALITY_VERDICT.json").write_text(json.dumps(verdict, indent=2) + "\n", encoding="utf-8")
    return verdict


def cabin_probe(cabin: Path, tex_dir: Path, out_dir: Path) -> dict:
    _clear_scene()
    _setup_look(96, (1080, 1080))
    _ground()
    before = set(bpy.data.objects.keys())
    with bpy.data.libraries.load(str(cabin), link=False) as (src, dst):
        names = list(src.objects or [])
        _log("cabin_available", names=names)
        dst.objects = names
        dst.images = list(src.images or [])
    loaded = [bpy.data.objects[name] for name in bpy.data.objects.keys() if name not in before]
    for obj in loaded:
        if obj.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(obj)
        obj.hide_render = False
        obj.hide_viewport = False
    hero = _largest_mesh([obj for obj in loaded if obj.name != "TJ_V4_GROUND"])
    maps = {
        "alb": tex_dir / "Cabin01_ALB.png",
        "nrm": tex_dir / "Cabin01_NRM.png",
        "spe": tex_dir / "Cabin01_SPE.png",
    }
    if hero is not None:
        _place(hero, (0.0, 0.0, 0.0), 4.2)
        for slot in hero.material_slots:
            mat = slot.material
            if mat is None or not mat.use_nodes:
                continue
            nodes = mat.node_tree.nodes
            links = mat.node_tree.links
            principled = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
            if principled is None:
                continue
            if maps["nrm"].exists() and not any(n.type == "NORMAL_MAP" for n in nodes):
                img = bpy.data.images.load(str(maps["nrm"]))
                tex = nodes.new("ShaderNodeTexImage")
                tex.image = img
                tex.image.colorspace_settings.name = "Non-Color"
                nrm = nodes.new("ShaderNodeNormalMap")
                links.new(tex.outputs["Color"], nrm.inputs["Color"])
                links.new(nrm.outputs["Normal"], principled.inputs["Normal"])
    _camera((5.6, -7.4, 3.4), (0.1, 0.2, 1.8), lens=35.0)
    still = out_dir / "CABIN_QUALITY_CROP.png"
    _render(still)
    sample = _inspect_object(hero) if hero is not None else {}
    verdict = {
        "source": str(cabin),
        "mapsPresent": {key: path.exists() for key, path in maps.items()},
        "sample": sample,
        "still": str(still),
        "status": "CABIN_ASSET_UPGRADE_REQUIRED",
        "reason": "Village Cabin*A remains a game-kit LOD. Maps do not add porch/roof/wall geometry.",
    }
    (out_dir / "CABIN_QUALITY_VERDICT.json").write_text(json.dumps(verdict, indent=2) + "\n", encoding="utf-8")
    return verdict


def meadow_probe(sources: list[Path], out_dir: Path) -> dict:
    _clear_scene()
    _setup_look(96, (1280, 720))
    _ground()
    loaded = []
    for i, blend in enumerate(sources):
        before = set(bpy.data.objects.keys())
        with bpy.data.libraries.load(str(blend), link=False) as (src, dst):
            dst.objects = list(src.objects or [])
            dst.images = list(src.images or [])
        new_objs = [bpy.data.objects[name] for name in bpy.data.objects.keys() if name not in before]
        for obj in new_objs:
            if obj.name not in bpy.context.scene.collection.objects:
                bpy.context.scene.collection.objects.link(obj)
            obj.hide_render = False
            obj.hide_viewport = False
        hero = _largest_mesh(new_objs)
        if hero is None:
            continue
        _place(hero, ((i % 3) * 1.15 - 1.15, (i // 3) * 1.15 - 0.3, 0.0), 0.85)
        loaded.append(hero)
    _camera((0.2, -4.6, 1.6), (0.0, 0.2, 0.45), lens=40.0)
    still = out_dir / "MEADOW_QUALITY_CROP.png"
    _render(still)
    samples = [_inspect_object(obj) for obj in loaded]
    volumetric = [item for item in samples if not item["thinCardLikely"] and item["verts"] >= 200]
    verdict = {
        "sources": [str(p) for p in sources],
        "samples": samples,
        "volumetricCount": len(volumetric),
        "still": str(still),
        "status": "MEADOW_PROOF_POSSIBLE_WITH_RECOVERED_ASSETS" if len(volumetric) >= 2 else "MEADOW_ASSET_OR_SYSTEM_UPGRADE_REQUIRED",
    }
    (out_dir / "MEADOW_QUALITY_VERDICT.json").write_text(json.dumps(verdict, indent=2) + "\n", encoding="utf-8")
    return verdict


def main() -> int:
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", required=True, choices=("inspect", "inspect-names", "vegetation", "cabin", "meadow"))
    parser.add_argument("--blend", default="")
    parser.add_argument("--blends", default="")
    parser.add_argument("--tex-dir", default="")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--want", default="")
    args = parser.parse_args(argv)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    blend = Path(args.blend) if args.blend else None
    blends = [Path(item) for item in args.blends.split(",") if item.strip()]
    if args.mode == "inspect":
        if blend is None:
            raise SystemExit("inspect requires --blend")
        inspect_blend(blend, out_dir / f"{blend.stem}_inspect.json", [n for n in args.want.split(",") if n])
        return 0
    if args.mode == "inspect-names":
        if blend is None:
            raise SystemExit("inspect-names requires --blend")
        with bpy.data.libraries.load(str(blend), link=True) as (src, dst):
            payload = {
                "blend": str(blend),
                "bytes": blend.stat().st_size,
                "objectCount": len(src.objects or []),
                "collectionCount": len(src.collections or []),
                "materialCount": len(src.materials or []),
                "imageCount": len(src.images or []),
                "objectNames": list(src.objects or [])[:120],
                "collectionNames": list(src.collections or [])[:80],
            }
        (out_dir / f"{blend.stem}_names.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        _log("inspect_names", **{k: payload[k] for k in ("objectCount", "collectionCount", "imageCount")})
        return 0
    if args.mode == "vegetation":
        vegetation_probe(blends or ([blend] if blend else []), out_dir)
        return 0
    if args.mode == "cabin":
        cabin_probe(blend, Path(args.tex_dir), out_dir)
        return 0
    if args.mode == "meadow":
        meadow_probe(blends or ([blend] if blend else []), out_dir)
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
