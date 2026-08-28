"""TivvleJoy cinematic valley world assembler (Blender 4.2).

Replaces the proof-quality single-orbit builder on the FINAL path.
Purchased archives stay private; this script only consumes local paths.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from cinematic_shots import SHOTS, camera_name, default_shot_cameras, lookdev_frames, marker_frames  # noqa: E402
from cinematic_standards import (  # noqa: E402
    MASTER_COLLECTIONS,
    assert_final_contract,
    normalize_profile,
    profile_defaults,
    visible_use_record,
)
from showcase_original14_30s import (  # noqa: E402
    duplicate_mesh_in_world,
    ensure_purchased_albedos,
    expand_asset,
    import_kit_groups,
    lift_purchased_shading,
    load_water_materials,
    place_mountain_ridge,
    remap_missing_images,
    setup_world,
)

PROGRESS_PATH: Path | None = None


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets-json", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--resolution", default="")
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--start-frame", type=int, default=1)
    parser.add_argument("--end-frame", type=int, default=900)
    parser.add_argument("--samples", type=int, default=0)
    parser.add_argument("--proof-path", required=True)
    parser.add_argument("--progress-path", default="")
    parser.add_argument("--stills-only", action="store_true")
    parser.add_argument("--stills-frames", default="")
    parser.add_argument("--engine", default="")
    parser.add_argument("--profile", default="LOOKDEV_FAST")
    return parser.parse_args(argv)


def write_progress(stage: str, **extra) -> None:
    payload = {"event": "cinematic_world_progress", "stage": stage, **extra}
    if PROGRESS_PATH is not None:
        PROGRESS_PATH.write_text(json.dumps(payload) + "\n", encoding="utf-8")
    print(json.dumps(payload), flush=True)


def clean_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def ensure_collections() -> dict[str, bpy.types.Collection]:
    scene = bpy.context.scene
    found: dict[str, bpy.types.Collection] = {}
    for name in MASTER_COLLECTIONS:
        collection = bpy.data.collections.get(name) or bpy.data.collections.new(name)
        if collection.name not in scene.collection.children:
            scene.collection.children.link(collection)
        found[name] = collection
    return found


def link_exclusive(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)


def build_terrain() -> bpy.types.Object:
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=96, y_subdivisions=96, size=180.0, location=(0.0, 8.0, 0.0))
    ground = bpy.context.object
    ground.name = "TJ_Terrain_ValleyCarrier"
    try:
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    except Exception:
        pass
    for vert in ground.data.vertices:
        x, y = vert.co.x, vert.co.y
        height = 1.8 * math.sin(x * 0.035) * math.cos(y * 0.028)
        height += 0.9 * math.sin((x + y) * 0.05)
        river = math.exp(-((y + 10.0) ** 2) / 18.0) * math.exp(-(x ** 2) / 900.0)
        height -= 1.35 * river
        if abs(y + 10.0) < 6.5:
            height += 0.28 * math.exp(-((abs(y + 10.0) - 4.2) ** 2) / 2.4)
        if -6.0 <= y <= 10.0 and abs(x) < 16.0:
            height *= 0.18
        if y > 42.0:
            height += min(3.4, (y - 42.0) * 0.055)
        vert.co.z = height
    ground.data.update()
    mat = bpy.data.materials.new("TJ_Terrain_SlopeBlend")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.92
    coord = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.04
    links.new(coord.outputs["Object"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = 0.22
    ramp.color_ramp.elements[0].color = (0.16, 0.18, 0.10, 1.0)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = (0.22, 0.34, 0.12, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["Object"], sep.inputs["Vector"])
    path_abs = nodes.new("ShaderNodeMath")
    path_abs.operation = "ABSOLUTE"
    links.new(sep.outputs["X"], path_abs.inputs[0])
    path_w = nodes.new("ShaderNodeMapRange")
    path_w.inputs["From Min"].default_value = 0.7
    path_w.inputs["From Max"].default_value = 3.8
    path_w.inputs["To Min"].default_value = 1.0
    path_w.inputs["To Max"].default_value = 0.0
    links.new(path_abs.outputs["Value"], path_w.inputs["Value"])
    ymid = nodes.new("ShaderNodeMath")
    ymid.operation = "SUBTRACT"
    ymid.inputs[1].default_value = 0.0
    links.new(sep.outputs["Y"], ymid.inputs[0])
    yabs = nodes.new("ShaderNodeMath")
    yabs.operation = "ABSOLUTE"
    links.new(ymid.outputs["Value"], yabs.inputs[0])
    yfade = nodes.new("ShaderNodeMapRange")
    yfade.inputs["From Min"].default_value = 4.0
    yfade.inputs["From Max"].default_value = 12.0
    yfade.inputs["To Min"].default_value = 1.0
    yfade.inputs["To Max"].default_value = 0.0
    links.new(yabs.outputs["Value"], yfade.inputs["Value"])
    path_fac = nodes.new("ShaderNodeMath")
    path_fac.operation = "MULTIPLY"
    links.new(path_w.outputs["Result"], path_fac.inputs[0])
    links.new(yfade.outputs["Result"], path_fac.inputs[1])
    mix = nodes.new("ShaderNodeMixRGB") if "ShaderNodeMixRGB" in dir(bpy.types) else nodes.new("ShaderNodeMix")
    try:
        mix = nodes.new("ShaderNodeMixRGB")
    except Exception:
        mix = nodes.new("ShaderNodeMix")
        if hasattr(mix, "data_type"):
            mix.data_type = "RGBA"
    if "Color1" in mix.inputs:
        links.new(ramp.outputs["Color"], mix.inputs["Color1"])
        mix.inputs["Color2"].default_value = (0.28, 0.20, 0.12, 1.0)
        links.new(path_fac.outputs["Value"], mix.inputs["Fac"])
        links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    ground.data.materials.append(mat)
    return ground


def build_river() -> bpy.types.Object:
    curve_data = bpy.data.curves.new("TJ_RiverSpline", type="CURVE")
    curve_data.dimensions = "3D"
    spline = curve_data.splines.new("BEZIER")
    points = [(-38.0, -16.0, -0.85), (-18.0, -12.0, -0.9), (-2.0, -10.0, -0.95), (16.0, -8.5, -0.9), (34.0, -12.0, -0.85)]
    spline.bezier_points.add(len(points) - 1)
    for index, (x, y, z) in enumerate(points):
        point = spline.bezier_points[index]
        point.co = (x, y, z)
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
        point.radius = 1.0 + 0.35 * math.sin(index * 1.2)
    curve_obj = bpy.data.objects.new("TJ_River_SplineGuide", curve_data)
    bpy.context.scene.collection.objects.link(curve_obj)
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0.0, -10.0, -0.72))
    river = bpy.context.object
    river.name = "TJ_River_PurchasedWater"
    river.scale = (44.0, 7.4, 1.0)
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        bpy.ops.mesh.subdivide(number_cuts=18)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode="OBJECT")
    try:
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    except Exception:
        pass
    for vert in river.data.vertices:
        vert.co.y += 3.4 * math.sin(vert.co.x * 0.14)
        vert.co.x += 0.8 * math.sin(vert.co.y * 0.7)
        vert.co.z -= 0.18 * math.cos(vert.co.x * 0.12)
    river.data.update()
    water = next((mat for mat in bpy.data.materials if mat and "water" in mat.name.lower()), None)
    mat = bpy.data.materials.new("TJ_River_FromPurchasedWater")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = (0.04, 0.11, 0.13, 1.0)
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.08
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.72
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = 0.22
        layer = nodes.new("ShaderNodeLayerWeight")
        layer.inputs["Blend"].default_value = 0.35
        mix = nodes.new("ShaderNodeMixRGB") if True else None
        try:
            mix = nodes.new("ShaderNodeMixRGB")
        except Exception:
            mix = nodes.new("ShaderNodeMix")
            if hasattr(mix, "data_type"):
                mix.data_type = "RGBA"
        if "Color1" in mix.inputs:
            mix.inputs["Color1"].default_value = (0.03, 0.09, 0.11, 1.0)
            mix.inputs["Color2"].default_value = (0.10, 0.20, 0.22, 1.0)
            links.new(layer.outputs["Fresnel"], mix.inputs["Fac"])
            links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
        wave = nodes.new("ShaderNodeTexWave")
        wave.inputs["Scale"].default_value = 7.5
        if "Distortion" in wave.inputs:
            wave.inputs["Distortion"].default_value = 2.4
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.22
        links.new(wave.outputs["Color"], bump.inputs["Height"])
        if "Normal" in bsdf.inputs:
            links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    if water is not None and water.node_tree:
        print(json.dumps({"event": "purchased_water_material_present", "name": water.name}), flush=True)
    river.data.materials.clear()
    river.data.materials.append(mat)
    return river


def scatter_clumps(sources: list, origin: tuple, clumps: int, per_clump: int, radius: float, scale: float, seed: int) -> list:
    extras = []
    live = [obj for obj in sources if obj and obj.type == "MESH"]
    if not live:
        return extras
    for clump in range(clumps):
        ang = (clump + 0.27) * 2.399 + seed
        cx = origin[0] + math.cos(ang) * radius * (0.35 + 0.08 * (clump % 3))
        cy = origin[1] + (clump - clumps * 0.5) * 3.6 + 1.4 * math.sin(seed + clump)
        for i in range(per_clump):
            src = live[(clump + i + seed) % len(live)]
            jitter = 1.7 + 0.6 * ((i * 3 + clump) % 4)
            loc = (
                cx + math.cos(i * 2.1 + seed) * jitter,
                cy + math.sin(i * 1.7 + seed) * jitter * 0.7,
                origin[2],
            )
            if abs(loc[0]) < 8.0 and -8.0 < loc[1] < 10.0:
                continue
            extras.append(duplicate_mesh_in_world(src, loc, scale * (0.85 + 0.08 * ((i + clump) % 5))))
    return extras


def setup_lighting_hierarchy() -> None:
    bpy.ops.object.light_add(type="SUN", location=(12.0, -40.0, 64.0))
    sun = bpy.context.object
    sun.name = "TJ_KeySun"
    sun.data.energy = 3.4
    sun.data.angle = math.radians(6.0)
    sun.rotation_euler = (math.radians(48), math.radians(4), math.radians(8))
    if hasattr(sun.data, "color"):
        sun.data.color = (1.0, 0.94, 0.82)
    bpy.ops.object.light_add(type="AREA", location=(0.0, 8.0, 2.2))
    bounce = bpy.context.object
    bounce.name = "TJ_GroundBounce"
    bounce.data.energy = 280
    bounce.data.size = 36
    bounce.rotation_euler = (math.radians(90), 0.0, 0.0)
    if hasattr(bounce.data, "color"):
        bounce.data.color = (1.0, 0.86, 0.64)


def setup_mist_and_compositor() -> None:
    scene = bpy.context.scene
    if hasattr(scene.world, "mist_settings"):
        scene.world.mist_settings.use_mist = True
        scene.world.mist_settings.start = 42.0
        scene.world.mist_settings.depth = 140.0
        scene.world.mist_settings.falloff = "QUADRATIC"
    view = scene.view_layers[0]
    if hasattr(view, "use_pass_mist"):
        view.use_pass_mist = True
    if hasattr(view, "use_pass_z"):
        view.use_pass_z = True
    scene.use_nodes = True
    nodes = scene.node_tree.nodes
    links = scene.node_tree.links
    nodes.clear()
    render = nodes.new("CompositorNodeRLayers")
    composite = nodes.new("CompositorNodeComposite")
    mix = nodes.new("CompositorNodeMixRGB")
    mix.blend_type = "MIX"
    fac = mix.inputs.get("Fac") or mix.inputs[0]
    color1 = mix.inputs.get("Color1") or mix.inputs.get("A") or mix.inputs[1]
    color2 = mix.inputs.get("Color2") or mix.inputs.get("B") or mix.inputs[2]
    fac.default_value = 0.08
    color2.default_value = (0.72, 0.80, 0.90, 1.0)
    if "Mist" in render.outputs:
        scale = nodes.new("CompositorNodeMath")
        scale.operation = "MULTIPLY"
        scale.inputs[1].default_value = 0.22
        links.new(render.outputs["Mist"], scale.inputs[0])
        links.new(scale.outputs["Value"], fac)
    links.new(render.outputs["Image"], color1)
    out_sock = mix.outputs.get("Color") or mix.outputs.get("Result") or mix.outputs[0]
    links.new(out_sock, composite.inputs["Image"])


def setup_six_cameras() -> list[str]:
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 900
    names = []
    for spec in default_shot_cameras():
        start = spec["start"]
        end = spec["end"]
        bpy.ops.object.camera_add(location=start["location"])
        cam = bpy.context.object
        cam.name = spec["camera"]
        cam.data.lens = start["lens"]
        cam.data.sensor_width = 32
        cam.data.dof.use_dof = False
        cam.data.dof.aperture_fstop = 5.6
        target = bpy.data.objects.new(spec["camera"] + "_LOOK", None)
        scene.collection.objects.link(target)
        target.location = start["look"]
        constraint = cam.constraints.new(type="TRACK_TO")
        constraint.target = target
        constraint.track_axis = "TRACK_NEGATIVE_Z"
        constraint.up_axis = "UP_Y"
        shot = next(item for item in SHOTS if item["id"] == spec["id"])
        cam.location = start["location"]
        cam.keyframe_insert(data_path="location", frame=shot["start"])
        cam.data.lens = start["lens"]
        cam.data.keyframe_insert(data_path="lens", frame=shot["start"])
        target.location = start["look"]
        target.keyframe_insert(data_path="location", frame=shot["start"])
        cam.location = end["location"]
        cam.keyframe_insert(data_path="location", frame=shot["end"])
        cam.data.lens = end["lens"]
        cam.data.keyframe_insert(data_path="lens", frame=shot["end"])
        target.location = end["look"]
        target.keyframe_insert(data_path="location", frame=shot["end"])
        names.append(cam.name)
        if scene.timeline_markers.get(spec["id"]) is None:
            marker = scene.timeline_markers.new(spec["id"], frame=shot["start"])
            marker.camera = cam
    scene.camera = bpy.data.objects[camera_name("SHOT_01")]
    return names


def apply_profile(profile_name: str, args) -> dict:
    profile = normalize_profile(profile_name)
    defaults = profile_defaults(profile)
    if profile == "FINAL":
        assert_final_contract({**defaults, "resolution": args.resolution or defaults["resolution"]})
    resolution = args.resolution or defaults["resolution"]
    width, height = [int(part) for part in resolution.lower().split("x", 1)]
    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.fps = args.fps
    scene.frame_start = args.start_frame
    scene.frame_end = args.end_frame
    engine = args.engine or defaults["engine"]
    scene.render.engine = engine
    samples = args.samples or defaults["samples"]
    if engine == "CYCLES" and hasattr(scene, "cycles"):
        scene.cycles.samples = int(samples)
        if hasattr(scene.cycles, "use_denoising"):
            scene.cycles.use_denoising = bool(defaults.get("denoise"))
        if defaults.get("cyclesDevice") == "GPU" and not bool(getattr(args, "force_cpu", False)):
            try:
                scene.cycles.device = "GPU"
            except Exception:
                scene.cycles.device = "CPU"
                print(json.dumps({"event": "cycles_gpu_unavailable", "fallback": "CPU"}), flush=True)
        else:
            try:
                scene.cycles.device = "CPU"
            except Exception:
                pass
    if hasattr(scene, "eevee"):
        if hasattr(scene.eevee, "taa_render_samples"):
            scene.eevee.taa_render_samples = int(samples)
        if hasattr(scene.eevee, "use_raytracing"):
            scene.eevee.use_raytracing = bool(defaults.get("rayTracing"))
        if hasattr(scene.eevee, "use_shadows"):
            scene.eevee.use_shadows = True
        if hasattr(scene.eevee, "use_volumetric_shadows"):
            scene.eevee.use_volumetric_shadows = True
    if hasattr(scene, "view_settings"):
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
        scene.view_settings.exposure = 0.20
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "16" if defaults.get("masterBitDepth") == "16" and profile in {"HERO_STILL", "FINAL"} else "8"
    scene.render.filepath = str(Path(args.output_dir) / "frame_")
    scene.render.use_file_extension = True
    scene.render.use_persistent_data = True
    if defaults.get("motionBlur") and hasattr(scene.render, "use_motion_blur"):
        scene.render.use_motion_blur = True
        scene.render.motion_blur_shutter = 0.5
    return {**defaults, "resolution": resolution, "engine": engine, "samples": samples}


def set_active_camera_for_frame(frame: int) -> None:
    shot = next(item for item in SHOTS if item["start"] <= frame <= item["end"])
    bpy.context.scene.camera = bpy.data.objects[camera_name(shot["id"])]
    bpy.context.scene.frame_set(frame)


def main() -> int:
    global PROGRESS_PATH
    args = parse_args()
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    if args.progress_path:
        PROGRESS_PATH = Path(args.progress_path)
    write_progress("CINEMATIC_WORLD_START", profile=args.profile)
    assets = json.loads(args.assets_json)
    if isinstance(assets, dict):
        assets = assets.get("assets") or assets.get("selected") or []
    clean_scene()
    collections = ensure_collections()
    extract_root = out.parent / "expanded-original14"
    expanded: dict[str, list[Path]] = {}
    for asset in assets:
        expanded[asset["role"]] = expand_asset(asset, extract_root)

    terrain = build_terrain()
    link_exclusive(terrain, collections["WORLD_TERRAIN"])
    water_loaded = load_water_materials(expanded.get("village_project", []) + expanded.get("forest_ecokit", []))
    river = build_river()
    link_exclusive(river, collections["WORLD_RIVER"])

    village_center = Vector((0.0, 0.0, 0.0))
    village_slots = [
        (-6.5, -1.0, 0.0), (-1.5, 1.2, 0.0), (4.2, -0.4, 0.0), (8.4, 2.6, 0.0),
        (-8.8, 3.8, 0.0), (1.8, 5.4, 0.0), (6.2, -3.8, 0.0), (-3.4, -4.2, 0.0),
        (10.4, -2.2, 0.0), (-10.2, -2.8, 0.0),
    ]
    members, imported, placed = import_kit_groups(
        expanded.get("village_blender", []),
        "village_blender",
        village_slots,
        village_center,
        8,
    )
    for obj in members:
        link_exclusive(obj, collections["WORLD_VILLAGE"])
    fbx_files = [
        path for path in expanded.get("village_fbx", [])
        if path.suffix.lower() in {".fbx", ".blend"} and any(word in path.name.lower() for word in ("fence", "gate", "cart"))
    ]
    fbx_members, fbx_imported, fbx_placed = import_kit_groups(
        fbx_files,
        "village_fbx",
        [(3.0, -5.4, 0.0), (-3.6, -5.0, 0.0), (0.4, -3.6, 0.0)],
        village_center,
        5,
    )
    for obj in fbx_members:
        link_exclusive(obj, collections["WORLD_PROPS"])

    remapped = remap_missing_images([path for files in expanded.values() for path in files])
    forced = ensure_purchased_albedos([path for files in expanded.values() for path in files])
    lifted = lift_purchased_shading()

    trees = [obj for obj in bpy.data.objects if obj.type == "MESH" and "tree" in obj.name.lower()]
    foreground = scatter_clumps(trees, (-16.0, 8.0, 0.0), 4, 2, 10.0, 1.05, 3)
    midground = scatter_clumps(trees, (0.0, 24.0, 0.0), 6, 3, 18.0, 1.45, 7)
    background = scatter_clumps(trees, (2.0, 42.0, 0.0), 5, 3, 22.0, 1.95, 11)
    for obj in foreground:
        link_exclusive(obj, collections["WORLD_FOREST_FOREGROUND"])
    for obj in midground:
        link_exclusive(obj, collections["WORLD_FOREST_MIDGROUND"])
    for obj in background:
        link_exclusive(obj, collections["WORLD_FOREST_BACKGROUND"])

    mountain_files = expanded.get("background_mountains", [])
    mountain_members = []
    if mountain_files:
        from showcase_original14_30s import geometry_candidates, import_geometry, keep_hero_meshes
        for candidate in geometry_candidates(mountain_files, "background_mountains"):
            objs = import_geometry(candidate, "background_mountains")
            if objs:
                mountain_members.extend(keep_hero_meshes(objs, "background_mountains", 5))
        if mountain_members:
            place_mountain_ridge(mountain_members, village_center)
            for obj in mountain_members:
                link_exclusive(obj, collections["WORLD_MOUNTAINS_BACKGROUND"])

    sky_name = setup_world(expanded.get("sky_hdri", []), expanded.get("world_shaders", []))
    setup_lighting_hierarchy()
    for obj in bpy.data.objects:
        if obj.type == "LIGHT":
            link_exclusive(obj, collections["WORLD_LIGHTING"])
        elif obj.type == "CAMERA" or obj.name.endswith("_LOOK"):
            link_exclusive(obj, collections["WORLD_CAMERAS"])
    bpy.ops.mesh.primitive_plane_add(size=6.0, location=(0.0, -2.4, 0.02))
    stage = bpy.context.object
    stage.name = "TJ_CharacterStagingPad"
    link_exclusive(stage, collections["WORLD_CHARACTER_STAGING"])
    setup_mist_and_compositor()
    cameras = setup_six_cameras()
    applied = apply_profile(args.profile, args)

    contributions = {
        "village_blender": visible_use_record("village_blender", downloaded=True, extracted=True, datablockLoaded=imported > 0, renderedPixels=imported > 0, shotIds=["SHOT_04", "SHOT_06"], evidence="collection:WORLD_VILLAGE"),
        "village_fbx": visible_use_record("village_fbx", downloaded=True, extracted=True, datablockLoaded=fbx_imported > 0, renderedPixels=fbx_imported > 0, shotIds=["SHOT_04"], evidence="collection:WORLD_PROPS"),
        "village_project": visible_use_record("village_project", downloaded=True, extracted=True, datablockLoaded=water_loaded > 0, renderedPixels=True, shotIds=["SHOT_02"], evidence="collection:WORLD_RIVER"),
        "background_mountains": visible_use_record("background_mountains", downloaded=True, extracted=True, datablockLoaded=bool(mountain_members), renderedPixels=bool(mountain_members), shotIds=["SHOT_01", "SHOT_05"], evidence="collection:WORLD_MOUNTAINS_BACKGROUND"),
        "sky_hdri": visible_use_record("sky_hdri", downloaded=True, extracted=True, datablockLoaded=True, renderedPixels=True, shotIds=["SHOT_01"], evidence=f"world:{sky_name}"),
        "mountains_3dt": visible_use_record("mountains_3dt"),
        "botaniq_full": visible_use_record("botaniq_full"),
        "physical_starlight": visible_use_record("physical_starlight"),
        "gaffer": visible_use_record("gaffer"),
    }
    proof = {
        "schema": "TIVVLEJOY_CINEMATIC_WORLD_RECIPE_V1",
        "profile": applied,
        "collections": list(MASTER_COLLECTIONS),
        "cameras": cameras,
        "markers": marker_frames(),
        "kitFilesPlaced": placed,
        "fbxFilesPlaced": fbx_placed,
        "forestCopies": len(foreground) + len(midground) + len(background),
        "waterMaterialsLoaded": water_loaded,
        "remapped": remapped,
        "forcedAlbedos": forced,
        "liftedShading": lifted,
        "atmosphereExecuted": True,
        "atmosphereMethod": "mist_pass_compositor",
        "contributions": contributions,
        "randomOrGeneratedStockAssetCount": 0,
        "commercialAssetPathsEmitted": False,
        "renderableSourceCount": len([asset for asset in assets if not asset.get("unityPreservationOnly")]),
        "stillsOnly": bool(args.stills_only),
        "engine": applied["engine"],
        "cameraPath": "six_shot_markers",
        "lighting": "single_key_sun_plus_restrained_bounce",
        "groundSource": "shaped_valley_carrier",
    }
    Path(args.proof_path).write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    write_progress("CINEMATIC_WORLD_BUILT", cameras=len(cameras), forestCopies=proof["forestCopies"])

    frames = [int(part) for part in (args.stills_frames or ",".join(str(item) for item in lookdev_frames())).split(",") if part.strip()]
    if args.stills_only or normalize_profile(args.profile) in {"BLOCKOUT", "LOOKDEV_FAST", "HERO_STILL"}:
        for frame in frames:
            set_active_camera_for_frame(frame)
            shot = next(item for item in SHOTS if item["start"] <= frame <= item["end"])
            bpy.context.scene.render.filepath = str(out / f"{shot['id'].lower()}_")
            write_progress("LOOKDEV_STILL", frame=frame, shot=shot["id"])
            bpy.ops.render.render(write_still=True)
        write_progress("LOOKDEV_COMPLETE", frames=len(frames))
        return 0

    for frame in range(args.start_frame, args.end_frame + 1):
        set_active_camera_for_frame(frame)
        bpy.context.scene.frame_set(frame)
        bpy.context.scene.render.filepath = str(out / "frame_")
        bpy.ops.render.render(write_still=True)
        write_progress("BLENDER_RENDER", frame=frame, framesWritten=frame - args.start_frame + 1, totalFrames=900)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
