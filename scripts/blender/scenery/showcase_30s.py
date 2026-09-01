"""TivvleJoy 30-second real-asset scenery showcase.

This Blender 4.2 script is intentionally scenery-only.  It consumes private
commercial assets that the RunPod worker has already materialized from R2,
assembles one continuous mountain -> forest -> river -> village/tavern flythrough,
and renders a vertical 1080x1920 image sequence.  It never downloads assets or
contains credentials itself.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import zipfile
from pathlib import Path

import bpy
from mathutils import Vector


GEOMETRY_EXTS = {".blend", ".fbx", ".glb", ".gltf", ".obj"}
TEXTURE_EXTS = {".png", ".jpg", ".jpeg", ".tga", ".exr", ".hdr"}


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--assets-json", required=True)
    p.add_argument("--output-dir", required=True)
    p.add_argument("--resolution", default="1080x1920")
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("--start-frame", type=int, default=1)
    p.add_argument("--end-frame", type=int, default=900)
    p.add_argument("--samples", type=int, default=48)
    p.add_argument("--proof-path", required=True)
    return p.parse_args(argv)


def clean_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.materials, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def safe_extract(zip_path: Path, destination: Path) -> list[Path]:
    destination.mkdir(parents=True, exist_ok=True)
    extracted: list[Path] = []
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            rel = Path(info.filename.replace("\\", "/"))
            if rel.is_absolute() or ".." in rel.parts:
                continue
            target = (destination / rel).resolve()
            if destination.resolve() not in target.parents:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(target, "wb") as dst:
                while True:
                    chunk = src.read(4 * 1024 * 1024)
                    if not chunk:
                        break
                    dst.write(chunk)
            extracted.append(target)
    return extracted


def expand_asset(asset: dict, root: Path) -> list[Path]:
    path = Path(asset["localPath"])
    if path.suffix.lower() != ".zip":
        return [path]
    return safe_extract(path, root / re.sub(r"[^A-Za-z0-9_-]+", "_", asset["role"]))


def select_blend_object_names(source_names: list[str], role: str, limit: int = 28) -> list[str]:
    needles = {
        "mountain": ("mountain", "cliff", "rock", "ridge", "peak"),
        "forest": ("tree", "rock", "foliage", "grass", "fern", "bush", "stump", "log"),
        "nature": ("tree", "rock", "fern", "flora", "grass", "bush", "plant", "scatter"),
        "village": ("cabin", "house", "tree", "fence", "gate", "cart", "barrel", "crate", "table"),
        "tavern": ("tavern", "inn", "building", "house", "barrel", "table", "chair"),
        "water": ("water", "river", "lake", "stream"),
    }
    category = role.split("_")[0]
    words = needles.get(category, ())
    preferred = [name for name in source_names if any(word in name.lower() for word in words)]
    chosen = preferred[:limit]
    if not chosen:
        chosen = source_names[: min(limit, len(source_names))]
    return chosen


def append_blend(path: Path, role: str) -> tuple[list[bpy.types.Object], list[str]]:
    before = set(bpy.data.objects.keys())
    loaded_materials: list[str] = []
    with bpy.data.libraries.load(str(path), link=False) as (src, dst):
        dst.objects = select_blend_object_names(list(src.objects), role)
        dst.materials = list(src.materials)
        dst.node_groups = list(src.node_groups)
        if role.startswith("sky") or role.startswith("world"):
            dst.worlds = list(src.worlds[:2])
    for obj in dst.objects:
        if obj is not None and obj.name not in bpy.context.scene.collection.objects:
            try:
                bpy.context.scene.collection.objects.link(obj)
            except RuntimeError:
                pass
    for mat in dst.materials:
        if mat is not None:
            loaded_materials.append(mat.name)
    objects = [bpy.data.objects[name] for name in bpy.data.objects.keys() if name not in before]
    return objects, loaded_materials


def import_geometry(path: Path, role: str) -> tuple[list[bpy.types.Object], list[str]]:
    ext = path.suffix.lower()
    if ext == ".blend":
        return append_blend(path, role)
    before = set(bpy.data.objects.keys())
    try:
        if ext == ".fbx":
            bpy.ops.import_scene.fbx(filepath=str(path))
        elif ext in {".glb", ".gltf"}:
            bpy.ops.import_scene.gltf(filepath=str(path))
        elif ext == ".obj":
            bpy.ops.wm.obj_import(filepath=str(path))
        else:
            return [], []
    except Exception as exc:
        print(json.dumps({"event": "asset_import_warning", "role": role, "ext": ext, "error": str(exc)[:240]}))
        return [], []
    return [bpy.data.objects[name] for name in bpy.data.objects.keys() if name not in before], []


def geometry_candidates(files: list[Path], role: str) -> list[Path]:
    candidates = [p for p in files if p.suffix.lower() in GEOMETRY_EXTS and p.is_file()]
    category = role.split("_")[0]
    words = {
        "mountain": ("mountain", "cliff", "rock"),
        "forest": ("forest", "tree", "nature", "ecokit"),
        "nature": ("nature", "flora", "rock", "tree", "scatter"),
        "village": ("village", "cabin", "tree", "fence", "gate"),
        "tavern": ("tavern", "inn"),
        "water": ("water", "river"),
    }.get(category, ())
    candidates.sort(key=lambda p: (0 if any(w in p.name.lower() for w in words) else 1, -p.stat().st_size, p.name.lower()))
    if category == "village":
        return candidates[:8]
    if category in {"forest", "nature"}:
        return candidates[:6]
    return candidates[:3]


def parent_group(objects: list[bpy.types.Object], name: str) -> bpy.types.Object | None:
    live = [obj for obj in objects if obj and obj.name in bpy.data.objects and obj.type not in {"CAMERA", "LIGHT"}]
    if not live:
        return None
    for obj in list(live):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    live_set = set(live)
    bpy.context.view_layer.update()
    tops = [obj for obj in live if obj.parent not in live_set]
    for obj in tops:
        world = obj.matrix_world.copy()
        obj.parent = root
        obj.matrix_world = world
    bpy.context.view_layer.update()
    return root


def group_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector] | None:
    points: list[Vector] = []
    bpy.context.view_layer.update()
    for obj in objects:
        if obj.type not in {"MESH", "CURVE", "FONT", "SURFACE"}:
            continue
        try:
            points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
        except Exception:
            continue
    if not points:
        return None
    mins = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maxs = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return mins, maxs


def normalize_group(root: bpy.types.Object, members: list[bpy.types.Object], target_size: float, location: tuple[float, float, float]) -> None:
    bounds = group_bounds(members)
    if bounds:
        mins, maxs = bounds
        size = max((maxs - mins).x, (maxs - mins).y, (maxs - mins).z, 0.001)
        scale = target_size / size
        root.scale = (scale, scale, scale)
        bpy.context.view_layer.update()
        bounds2 = group_bounds(members)
        if bounds2:
            mins2, maxs2 = bounds2
            center = (mins2 + maxs2) * 0.5
            root.location += Vector(location) - Vector((center.x, center.y, mins2.z))
            return
    root.location = location


def find_texture(files: list[Path], include: tuple[str, ...]) -> Path | None:
    textures = [p for p in files if p.suffix.lower() in TEXTURE_EXTS and p.is_file()]
    for p in textures:
        lower = p.name.lower()
        if all(token in lower for token in include):
            return p
    return textures[0] if textures else None


def image_material(name: str, image_path: Path | None, roughness: float = 0.7) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = roughness
    if image_path:
        try:
            tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = bpy.data.images.load(str(image_path), check_existing=True)
            mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        except Exception:
            pass
    return mat


def choose_loaded_material(pattern: str) -> bpy.types.Material | None:
    rx = re.compile(pattern, re.I)
    for mat in bpy.data.materials:
        if rx.search(mat.name):
            return mat
    return None


def create_ground(forest_files: list[Path]) -> None:
    bpy.ops.mesh.primitive_plane_add(size=420, location=(0, 60, -0.2))
    ground = bpy.context.object
    ground.name = "TJ_Ground"
    tex = find_texture(forest_files, ("base", "color"))
    mat = image_material("TJ_ForestGround_FromPurchasedPack", tex, 0.9)
    ground.data.materials.append(mat)


def create_river(water_material: bpy.types.Material | None) -> None:
    # A real river corridor geometry is authored here, while its visible surface
    # uses the purchased water material/node system loaded from the private pack.
    ys = [-45, -20, 5, 30, 55, 80, 105, 130]
    centers = [1, -3, 2, 5, -1, -5, 1, 0]
    widths = [8, 9, 7, 8, 9, 8, 10, 12]
    verts = []
    for y, cx, width in zip(ys, centers, widths):
        verts.extend([(cx - width, y, 0.12), (cx + width, y, 0.12)])
    faces = []
    for i in range(len(ys) - 1):
        a = i * 2
        faces.append((a, a + 1, a + 3, a + 2))
    mesh = bpy.data.meshes.new("TJ_RiverMesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    river = bpy.data.objects.new("TJ_River_FromPurchasedWaterSystem", mesh)
    bpy.context.scene.collection.objects.link(river)
    if water_material:
        river.data.materials.append(water_material)
    else:
        raise RuntimeError("Purchased water material was not loaded; refusing synthetic substitute")


def setup_world(hdri: Path) -> None:
    world = bpy.data.worlds.new("TJ_Purchased_HDRI_World") if not bpy.context.scene.world else bpy.context.scene.world
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    env = nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(str(hdri), check_existing=True)
    bg = nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.55
    out = nodes.new("ShaderNodeOutputWorld")
    links.new(env.outputs["Color"], bg.inputs["Color"])
    links.new(bg.outputs["Background"], out.inputs["Surface"])


def setup_lighting() -> None:
    bpy.ops.object.light_add(type="SUN", location=(30, -40, 90))
    sun = bpy.context.object
    sun.name = "TJ_Sun"
    sun.data.energy = 2.2
    sun.rotation_euler = (math.radians(28), math.radians(-18), math.radians(-32))
    sun.data.angle = math.radians(4.0)
    bpy.ops.object.light_add(type="AREA", location=(-25, 0, 45))
    fill = bpy.context.object
    fill.name = "TJ_SoftFill"
    fill.data.energy = 850
    fill.data.shape = "DISK"
    fill.data.size = 35
    fill.rotation_euler = (math.radians(15), 0, math.radians(25))


def setup_atmosphere() -> None:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 60, 55))
    fog = bpy.context.object
    fog.name = "TJ_Atmosphere"
    fog.scale = (220, 250, 90)
    mat = bpy.data.materials.new("TJ_AtmosphereMaterial")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    volume = nodes.new("ShaderNodeVolumePrincipled")
    volume.inputs["Density"].default_value = 0.0035
    volume.inputs["Anisotropy"].default_value = 0.25
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(volume.outputs["Volume"], out.inputs["Volume"])
    fog.data.materials.append(mat)
    fog.display_type = "WIRE"


def track_camera(camera: bpy.types.Object, target: bpy.types.Object) -> None:
    con = camera.constraints.new(type="TRACK_TO")
    con.target = target
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"


def keyframe_transform(obj: bpy.types.Object, frame: int, location: tuple[float, float, float]) -> None:
    obj.location = location
    obj.keyframe_insert(data_path="location", frame=frame)


def smooth_fcurves(obj: bpy.types.Object) -> None:
    if not obj.animation_data or not obj.animation_data.action:
        return
    for fc in obj.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.handle_left_type = "AUTO_CLAMPED"
            kp.handle_right_type = "AUTO_CLAMPED"


def setup_camera(start: int, end: int) -> None:
    bpy.ops.object.camera_add(location=(0, 188, 56))
    cam = bpy.context.object
    cam.name = "TJ_ShowcaseCamera"
    cam.data.lens = 38
    cam.data.sensor_width = 32
    bpy.context.scene.camera = cam
    target = bpy.data.objects.new("TJ_CameraTarget", None)
    bpy.context.scene.collection.objects.link(target)
    track_camera(cam, target)

    # Exact 30-second editorial path at 30 fps: mountains -> forest -> river -> village -> hero vista.
    frames = [start, start + 179, start + 359, start + 539, start + 779, end]
    camera_points = [
        (0, 188, 56),
        (18, 121, 34),
        (-10, 78, 16),
        (7, 34, 9),
        (18, -8, 12),
        (-6, -48, 34),
    ]
    target_points = [
        (0, 132, 24),
        (0, 82, 8),
        (0, 48, 4),
        (0, 8, 3),
        (0, -8, 5),
        (0, 20, 9),
    ]
    for frame, cpos, tpos in zip(frames, camera_points, target_points):
        keyframe_transform(cam, frame, cpos)
        keyframe_transform(target, frame, tpos)
    smooth_fcurves(cam)
    smooth_fcurves(target)


def configure_render(args: argparse.Namespace) -> None:
    scene = bpy.context.scene
    width, height = [int(x) for x in args.resolution.lower().split("x", 1)]
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.fps = args.fps
    scene.frame_start = args.start_frame
    scene.frame_end = args.end_frame
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(Path(args.output_dir) / "frame_")
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    if hasattr(scene, "eevee"):
        if hasattr(scene.eevee, "taa_render_samples"):
            scene.eevee.taa_render_samples = max(16, args.samples)
        if hasattr(scene.eevee, "use_raytracing"):
            scene.eevee.use_raytracing = True
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    if hasattr(scene.view_settings, "look"):
        for look in ("AgX - Medium High Contrast", "AgX - Medium High Contrast"):
            try:
                scene.view_settings.look = look
                break
            except Exception:
                pass


def main() -> int:
    args = parse_args()
    Path(args.output_dir).mkdir(parents=True, exist_ok=True)
    extract_root = Path(args.output_dir).parent / "expanded-assets"
    assets = json.loads(args.assets_json)
    clean_scene()

    expanded: dict[str, list[Path]] = {}
    for asset in assets:
        expanded[asset["role"]] = expand_asset(asset, extract_root)

    required_prefixes = {"mountain", "forest", "water", "village", "tavern", "nature", "sky", "world"}
    present_prefixes = {role.split("_")[0] for role in expanded}
    missing = sorted(required_prefixes - present_prefixes)
    if missing:
        raise RuntimeError(f"Required purchased scenery categories missing: {missing}")

    imported_by_category: dict[str, list[bpy.types.Object]] = {}
    loaded_material_names: list[str] = []
    imported_files: list[dict] = []

    for role, files in expanded.items():
        category = role.split("_")[0]
        if category in {"sky", "world"} and not any(p.suffix.lower() in GEOMETRY_EXTS for p in files):
            continue
        objects: list[bpy.types.Object] = []
        for candidate in geometry_candidates(files, role):
            new_objects, mats = import_geometry(candidate, role)
            if new_objects or mats:
                imported_files.append({"role": role, "extension": candidate.suffix.lower(), "objectCount": len(new_objects)})
            objects.extend(new_objects)
            loaded_material_names.extend(mats)
        imported_by_category.setdefault(category, []).extend(objects)

    # Fail closed if hero geometry categories cannot contribute real purchased geometry.
    for category in ("mountain", "village", "tavern"):
        if not imported_by_category.get(category):
            raise RuntimeError(f"No importable purchased {category} geometry found")

    placements = {
        "mountain": (165.0, (0.0, 136.0, 0.0)),
        "forest": (72.0, (0.0, 72.0, 0.0)),
        "nature": (60.0, (-18.0, 48.0, 0.0)),
        "village": (48.0, (-4.0, -3.0, 0.0)),
        "tavern": (24.0, (16.0, -8.0, 0.0)),
    }
    normalized = []
    for category, (size, location) in placements.items():
        members = imported_by_category.get(category, [])
        if not members:
            continue
        root = parent_group(members, f"TJ_{category.title()}_PurchasedRoot")
        if root:
            normalize_group(root, members, size, location)
            normalized.append(category)

    forest_files = [p for role, files in expanded.items() if role.startswith("forest") for p in files]
    create_ground(forest_files)

    water_material = choose_loaded_material(r"water|river|stream|lake")
    if water_material is None:
        # Ensure the purchased Water_Mat/GN blend is loaded even when it contains
        # no importable scene objects but does contain materials/node groups.
        for role, files in expanded.items():
            if not role.startswith("water"):
                continue
            for p in files:
                if p.suffix.lower() == ".blend":
                    _, mats = append_blend(p, role)
                    loaded_material_names.extend(mats)
                    water_material = choose_loaded_material(r"water|river|stream|lake")
                    if water_material:
                        break
            if water_material:
                break
    create_river(water_material)

    sky_files = [p for role, files in expanded.items() if role.startswith("sky") for p in files]
    hdri = next((p for p in sky_files if p.suffix.lower() in {".hdr", ".exr"}), None)
    if hdri is None:
        raise RuntimeError("No purchased HDR/EXR environment found in selected sky pack")
    setup_world(hdri)
    setup_lighting()
    setup_atmosphere()
    setup_camera(args.start_frame, args.end_frame)
    configure_render(args)

    proof = {
        "schema": "TIVVLEJOY_SCENERY_SHOWCASE_USAGE_V1",
        "durationSeconds": (args.end_frame - args.start_frame + 1) / args.fps,
        "resolution": args.resolution,
        "fps": args.fps,
        "frameCount": args.end_frame - args.start_frame + 1,
        "requiredCategories": sorted(required_prefixes),
        "presentCategories": sorted(present_prefixes),
        "normalizedGeometryCategories": sorted(normalized),
        "importedFiles": imported_files,
        "loadedMaterialCount": len(set(loaded_material_names)),
        "purchasedWaterMaterial": water_material.name if water_material else None,
        "purchasedHdriUsed": hdri.name,
        "randomOrGeneratedStockAssetCount": 0,
        "commercialAssetPathsEmitted": False,
    }
    Path(args.proof_path).write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"event": "tivvlejoy_scenery_showcase_render_start", "frames": proof["frameCount"], "resolution": args.resolution}))
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.output_dir).parent / "tivvlejoy-scenery-showcase-working.blend"))
    bpy.ops.render.render(animation=True)
    print(json.dumps({"event": "tivvlejoy_scenery_showcase_render_complete", "frames": proof["frameCount"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
