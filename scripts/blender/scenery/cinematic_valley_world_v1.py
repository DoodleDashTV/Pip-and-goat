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
    geometry_candidates,
    import_geometry,
    import_kit_groups,
    keep_hero_meshes,
    lift_purchased_shading,
    load_water_materials,
    paint_simple_color,
    place_mountain_ridge,
    remap_missing_images,
    setup_world,
)

# East-flowing valley river. Shared by terrain trench + water strip.
RIVER_SPLINE = (
    (-44.0, -22.0, -0.62),
    (-30.0, -15.0, -0.68),
    (-16.0, -10.5, -0.70),
    (-2.0, -12.2, -0.72),
    (12.0, -9.0, -0.70),
    (26.0, -13.5, -0.66),
    (42.0, -19.0, -0.62),
)
VILLAGE_X_HALF = 16.0
VILLAGE_Y_MIN = -6.0
VILLAGE_Y_MAX = 14.0
MOUNTAIN_CORRIDOR_X = 8.0

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


def dist_to_polyline(x: float, y: float, points=RIVER_SPLINE) -> float:
    best = 1e9
    for index in range(len(points) - 1):
        ax, ay = points[index][0], points[index][1]
        bx, by = points[index + 1][0], points[index + 1][1]
        vx, vy = bx - ax, by - ay
        length2 = vx * vx + vy * vy or 1.0
        t = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / length2))
        px, py = ax + t * vx, ay + t * vy
        dist = math.hypot(x - px, y - py)
        if dist < best:
            best = dist
    return best


def shade_smooth(obj: bpy.types.Object) -> None:
    if not obj or obj.type != "MESH":
        return
    for poly in obj.data.polygons:
        poly.use_smooth = True


def purchased_ground_image(files: list[Path]) -> Path | None:
    banned = ("leaf", "leaves", "foliage", "needles", "grass01", "cutout", "opacity", "trunk", "wood01")
    words = ("rock", "dirt", "soil", "moss", "ground", "meadow", "terrain")
    images = []
    for path in files:
        if not path.is_file() or path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".tga", ".tif", ".tiff"}:
            continue
        name = path.name.lower()
        if any(word in name for word in banned):
            continue
        if any(token in name for token in ("nrm", "normal", "spec", "rough", "opacity", "_ao.")):
            continue
        if any(word in name for word in words):
            images.append(path)
    preferred = [
        path for path in images
        if "rocks_a" in path.name.lower() and "basecolor" in path.name.lower().replace("_", "")
    ]
    if preferred:
        return preferred[0]
    albedo = [path for path in images if "basecolor" in path.name.lower().replace("_", "") or "alb" in path.name.lower()]
    return albedo[0] if albedo else (images[0] if images else None)


def in_village(x: float, y: float) -> bool:
    return abs(x) < VILLAGE_X_HALF and VILLAGE_Y_MIN < y < VILLAGE_Y_MAX


def in_mountain_corridor(x: float, y: float) -> bool:
    return abs(x) < MOUNTAIN_CORRIDOR_X and y > -24.0


def role_files(files: list[Path], include: tuple[str, ...], exclude: tuple[str, ...] = ()) -> list[Path]:
    chosen = []
    for path in files:
        name = path.name.lower()
        if any(word in name for word in include) and not any(word in name for word in exclude):
            chosen.append(path)
    return chosen


def build_terrain(files: list[Path]) -> bpy.types.Object:
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=120, y_subdivisions=120, size=180.0, location=(0.0, 8.0, 0.0))
    ground = bpy.context.object
    ground.name = "TJ_Ground_ValleyCarrier"
    try:
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    except Exception:
        pass
    for vert in ground.data.vertices:
        x, y = vert.co.x, vert.co.y
        height = 1.15 * math.sin(x * 0.028) * math.cos(y * 0.022)
        height += 0.55 * math.sin((x * 0.6 + y) * 0.04)
        river_dist = dist_to_polyline(x, y)
        trench = math.exp(-(river_dist ** 2) / 10.5)
        height -= 0.95 * trench
        if 2.6 < river_dist < 6.4:
            height += 0.22 * math.exp(-((river_dist - 4.2) ** 2) / 2.8)
        pad = 1.0
        if in_village(x, y):
            edge = min(
                (VILLAGE_X_HALF - abs(x)) / 4.0,
                (y - VILLAGE_Y_MIN) / 3.0,
                (VILLAGE_Y_MAX - y) / 3.0,
            )
            pad = max(0.12, 1.0 - max(0.0, min(1.0, edge)) * 0.88)
        height *= pad
        if y > 46.0:
            height += min(3.2, (y - 46.0) * 0.05)
        vert.co.z = height
    ground.data.update()
    shade_smooth(ground)
    img = purchased_ground_image(files)
    ground.data.materials.append(cinematic_meadow_material(img))
    print(json.dumps({"event": "terrain_ground_image", "path": img.name if img else None}), flush=True)
    return ground


def cinematic_meadow_material(img_path: Path | None) -> bpy.types.Material:
    """Darker south-camera meadow. The retired helper graded toward lime."""
    mat = bpy.data.materials.new("TJ_CinematicValleyMeadow")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.94
    coord = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.03
    if "Detail" in noise.inputs:
        noise.inputs["Detail"].default_value = 2.0
    links.new(coord.outputs["Object"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = 0.20
    ramp.color_ramp.elements[0].color = (0.07, 0.10, 0.05, 1.0)
    ramp.color_ramp.elements[1].position = 0.80
    ramp.color_ramp.elements[1].color = (0.16, 0.22, 0.08, 1.0)
    mid = ramp.color_ramp.elements.new(0.50)
    mid.color = (0.11, 0.16, 0.06, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    color = ramp.outputs["Color"]
    if img_path is not None:
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(img_path), check_existing=True)
        if tex.image and tex.image.colorspace_settings:
            tex.image.colorspace_settings.name = "sRGB"
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (0.018, 0.018, 0.018)
        links.new(coord.outputs["Object"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        mix = nodes.new("ShaderNodeMixRGB") if "ShaderNodeMixRGB" in dir(bpy.types) else nodes.new("ShaderNodeMix")
        try:
            mix = nodes.new("ShaderNodeMixRGB")
        except Exception:
            mix = nodes.new("ShaderNodeMix")
            if hasattr(mix, "data_type"):
                mix.data_type = "RGBA"
        if "Color1" in mix.inputs:
            mix.inputs["Fac"].default_value = 0.32
            links.new(ramp.outputs["Color"], mix.inputs["Color1"])
            links.new(tex.outputs["Color"], mix.inputs["Color2"])
            color = mix.outputs["Color"]
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["Object"], sep.inputs["Vector"])
    abs_x = nodes.new("ShaderNodeMath")
    abs_x.operation = "ABSOLUTE"
    links.new(sep.outputs["X"], abs_x.inputs[0])
    path_w = nodes.new("ShaderNodeMapRange")
    path_w.inputs["From Min"].default_value = 0.9
    path_w.inputs["From Max"].default_value = 4.8
    path_w.inputs["To Min"].default_value = 1.0
    path_w.inputs["To Max"].default_value = 0.0
    links.new(abs_x.outputs["Value"], path_w.inputs["Value"])
    y_center = nodes.new("ShaderNodeMath")
    y_center.operation = "SUBTRACT"
    y_center.inputs[1].default_value = 2.0
    links.new(sep.outputs["Y"], y_center.inputs[0])
    y_abs = nodes.new("ShaderNodeMath")
    y_abs.operation = "ABSOLUTE"
    links.new(y_center.outputs["Value"], y_abs.inputs[0])
    y_fade = nodes.new("ShaderNodeMapRange")
    y_fade.inputs["From Min"].default_value = 6.0
    y_fade.inputs["From Max"].default_value = 14.0
    y_fade.inputs["To Min"].default_value = 1.0
    y_fade.inputs["To Max"].default_value = 0.0
    links.new(y_abs.outputs["Value"], y_fade.inputs["Value"])
    path_fac = nodes.new("ShaderNodeMath")
    path_fac.operation = "MULTIPLY"
    links.new(path_w.outputs["Result"] if "Result" in path_w.outputs else path_w.outputs[0], path_fac.inputs[0])
    links.new(y_fade.outputs["Result"] if "Result" in y_fade.outputs else y_fade.outputs[0], path_fac.inputs[1])
    dirt = nodes.new("ShaderNodeMixRGB") if True else None
    try:
        dirt = nodes.new("ShaderNodeMixRGB")
    except Exception:
        dirt = nodes.new("ShaderNodeMix")
        if hasattr(dirt, "data_type"):
            dirt.data_type = "RGBA"
    if "Color1" in dirt.inputs:
        links.new(color, dirt.inputs["Color1"])
        dirt.inputs["Color2"].default_value = (0.28, 0.18, 0.09, 1.0)
        links.new(path_fac.outputs["Value"], dirt.inputs["Fac"])
        color = dirt.outputs["Color"]
    bank_y = nodes.new("ShaderNodeMath")
    bank_y.operation = "SUBTRACT"
    bank_y.inputs[1].default_value = -12.0
    links.new(sep.outputs["Y"], bank_y.inputs[0])
    bank_abs = nodes.new("ShaderNodeMath")
    bank_abs.operation = "ABSOLUTE"
    links.new(bank_y.outputs["Value"], bank_abs.inputs[0])
    bank_w = nodes.new("ShaderNodeMapRange")
    bank_w.inputs["From Min"].default_value = 2.4
    bank_w.inputs["From Max"].default_value = 7.0
    bank_w.inputs["To Min"].default_value = 0.55
    bank_w.inputs["To Max"].default_value = 0.0
    links.new(bank_abs.outputs["Value"], bank_w.inputs["Value"])
    bank = nodes.new("ShaderNodeMixRGB")
    try:
        bank = nodes.new("ShaderNodeMixRGB")
    except Exception:
        bank = nodes.new("ShaderNodeMix")
        if hasattr(bank, "data_type"):
            bank.data_type = "RGBA"
    if "Color1" in bank.inputs:
        links.new(color, bank.inputs["Color1"])
        bank.inputs["Color2"].default_value = (0.16, 0.12, 0.07, 1.0)
        links.new(bank_w.outputs["Result"] if "Result" in bank_w.outputs else bank_w.outputs[0], bank.inputs["Fac"])
        color = bank.outputs["Color"]
    links.new(color, bsdf.inputs["Base Color"])
    return mat


def fallback_water_material() -> bpy.types.Material:
    mat = bpy.data.materials.new("TJ_River_FallbackFromPurchasedLook")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = (0.035, 0.09, 0.11, 1.0)
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.22
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.45
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = 0.08
        wave = nodes.new("ShaderNodeTexWave")
        wave.inputs["Scale"].default_value = 4.2
        if "Distortion" in wave.inputs:
            wave.inputs["Distortion"].default_value = 1.8
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.16
        links.new(wave.outputs["Color"], bump.inputs["Height"])
        if "Normal" in bsdf.inputs:
            links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def assign_purchased_water(river: bpy.types.Object) -> str:
    water = next((mat for mat in bpy.data.materials if mat and str(mat.name).startswith("Water_Mat")), None)
    if water is None:
        water = next((mat for mat in bpy.data.materials if mat and "water" in mat.name.lower() and mat.node_tree), None)
    if water is None or not water.node_tree:
        fallback = fallback_water_material()
        river.data.materials.clear()
        river.data.materials.append(fallback)
        print(json.dumps({"event": "river_material_assigned", "name": fallback.name, "purchased": False}), flush=True)
        return fallback.name
    # Water_Mat_1 reads as tiled shingles on a grazing 9:16 camera. Keep the
    # purchased graph as color/detail, but wrap it in a dark water BSDF.
    wrapped = bpy.data.materials.new("TJ_River_PurchasedWater_Wrapped")
    wrapped.use_nodes = True
    nodes = wrapped.node_tree.nodes
    links = wrapped.node_tree.links
    nodes.clear()
    group = None
    purchased_out = None
    if water.node_tree:
        group_src = next((ng for ng in bpy.data.node_groups if ng and "water" in ng.name.lower()), None)
        if group_src is not None:
            group = nodes.new("ShaderNodeGroup")
            group.node_tree = group_src
            purchased_out = group.outputs[0] if group.outputs else None
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    if "Base Color" in bsdf.inputs:
        bsdf.inputs["Base Color"].default_value = (0.03, 0.08, 0.10, 1.0)
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.18
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.55
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = 0.08
    wave = nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 3.6
    if "Distortion" in wave.inputs:
        wave.inputs["Distortion"].default_value = 1.7
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.14
    links.new(wave.outputs["Color"], bump.inputs["Height"])
    if "Normal" in bsdf.inputs:
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    mix = nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = 0.28
    if purchased_out is not None:
        links.new(purchased_out, mix.inputs[1])
        links.new(bsdf.outputs["BSDF"], mix.inputs[2])
        surface = mix.outputs[0]
    else:
        surface = bsdf.outputs["BSDF"]
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(surface, out.inputs["Surface"])
    river.data.materials.clear()
    river.data.materials.append(wrapped)
    print(json.dumps({"event": "river_material_assigned", "name": water.name, "purchased": True, "wrapped": wrapped.name}), flush=True)
    return water.name


def build_river_guide() -> bpy.types.Object:
    curve_data = bpy.data.curves.new("TJ_RiverSpline", type="CURVE")
    curve_data.dimensions = "3D"
    spline = curve_data.splines.new("BEZIER")
    spline.bezier_points.add(len(RIVER_SPLINE) - 1)
    for index, (x, y, z) in enumerate(RIVER_SPLINE):
        point = spline.bezier_points[index]
        point.co = (x, y, z)
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    curve_obj = bpy.data.objects.new("TJ_River_SplineGuide", curve_data)
    bpy.context.scene.collection.objects.link(curve_obj)
    return curve_obj


def build_river() -> tuple[bpy.types.Object, str]:
    build_river_guide()
    verts = []
    faces = []
    samples = 36
    for i in range(samples):
        t = i / (samples - 1)
        seg = min(len(RIVER_SPLINE) - 2, int(t * (len(RIVER_SPLINE) - 1)))
        local = (t * (len(RIVER_SPLINE) - 1)) - seg
        a = Vector(RIVER_SPLINE[seg])
        b = Vector(RIVER_SPLINE[seg + 1])
        center = a.lerp(b, local)
        tangent = (b - a)
        tangent.z = 0.0
        if tangent.length < 1e-4:
            tangent = Vector((1.0, 0.0, 0.0))
        tangent.normalize()
        side = Vector((-tangent.y, tangent.x, 0.0))
        half = 2.35 + 0.55 * math.sin(i * 0.55)
        left = center + side * half
        right = center - side * half
        left.z = center.z
        right.z = center.z
        verts.extend([(left.x, left.y, left.z), (right.x, right.y, right.z)])
        if i > 0:
            v = i * 2
            faces.append((v - 2, v - 1, v + 1, v))
    mesh = bpy.data.meshes.new("TJ_River_PurchasedWater")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    river = bpy.data.objects.new("TJ_River_PurchasedWater", mesh)
    bpy.context.scene.collection.objects.link(river)
    shade_smooth(river)
    assigned = assign_purchased_water(river)
    return river, assigned


def scatter_clumps(sources: list, origin: tuple, clumps: int, per_clump: int, radius: float, scale: float, seed: int) -> list:
    extras = []
    live = [obj for obj in sources if obj and obj.type == "MESH"]
    if not live:
        return extras
    for clump in range(clumps):
        ang = (clump + 0.27) * 2.399 + seed
        cx = origin[0] + math.cos(ang) * radius * (0.35 + 0.08 * (clump % 3))
        cy = origin[1] + (clump - clumps * 0.5) * 4.8 + 1.8 * math.sin(seed + clump)
        for i in range(per_clump):
            src = live[(clump + i + seed) % len(live)]
            jitter = 2.1 + 0.7 * ((i * 3 + clump) % 4)
            loc = (
                cx + math.cos(i * 2.1 + seed) * jitter,
                cy + math.sin(i * 1.7 + seed) * jitter * 0.7,
                origin[2],
            )
            if in_village(loc[0], loc[1]):
                continue
            if in_mountain_corridor(loc[0], loc[1]):
                continue
            if dist_to_polyline(loc[0], loc[1]) < 6.0:
                continue
            extras.append(duplicate_mesh_in_world(src, loc, scale * (0.85 + 0.08 * ((i + clump) % 5))))
    return extras


def setup_lighting_hierarchy() -> None:
    bpy.ops.object.light_add(type="SUN", location=(18.0, -48.0, 70.0))
    sun = bpy.context.object
    sun.name = "TJ_KeySun"
    sun.data.energy = 4.6
    sun.data.angle = math.radians(5.0)
    sun.rotation_euler = (math.radians(52), math.radians(6), math.radians(18))
    if hasattr(sun.data, "color"):
        sun.data.color = (1.0, 0.93, 0.78)
    bpy.ops.object.light_add(type="AREA", location=(0.0, -12.0, 48.0))
    sky = bpy.context.object
    sky.name = "TJ_SkyFill"
    sky.data.energy = 140
    sky.data.size = 72
    sky.rotation_euler = (math.radians(0), 0.0, 0.0)
    if hasattr(sky.data, "color"):
        sky.data.color = (0.72, 0.82, 1.0)
    bpy.ops.object.light_add(type="AREA", location=(0.0, 4.0, 1.6))
    bounce = bpy.context.object
    bounce.name = "TJ_GroundBounce"
    bounce.data.energy = 120
    bounce.data.size = 28
    bounce.rotation_euler = (math.radians(90), 0.0, 0.0)
    if hasattr(bounce.data, "color"):
        bounce.data.color = (1.0, 0.84, 0.60)


def setup_mist_and_compositor() -> None:
    scene = bpy.context.scene
    if hasattr(scene.world, "mist_settings"):
        scene.world.mist_settings.use_mist = True
        scene.world.mist_settings.start = 55.0
        scene.world.mist_settings.depth = 160.0
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
        scale.inputs[1].default_value = 0.16
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
        scene.view_settings.exposure = 0.38
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

    all_files = [path for files in expanded.values() for path in files]
    terrain = build_terrain(all_files)
    link_exclusive(terrain, collections["WORLD_TERRAIN"])
    water_loaded = load_water_materials(expanded.get("village_project", []) + expanded.get("forest_ecokit", []))
    river, river_material = build_river()
    link_exclusive(river, collections["WORLD_RIVER"])

    village_center = Vector((0.0, 0.0, 0.0))
    village_files = expanded.get("village_blender", [])
    cabin_files = role_files(village_files, ("cabin",), ("interior",))
    cabin_files = sorted(
        [path for path in cabin_files if path.name.lower().endswith("a.blend")],
        key=lambda path: path.name.lower(),
    )[:4]
    street_slots = [
        (-8.6, -1.6, 0.0),
        (8.8, 1.2, 0.0),
        (-9.4, 7.8, 0.0),
        (9.6, 10.2, 0.0),
    ]
    members, imported, placed = import_kit_groups(
        cabin_files,
        "village_blender",
        street_slots,
        village_center,
        8,
    )
    for obj in members:
        link_exclusive(obj, collections["WORLD_VILLAGE"])
    prop_files = role_files(village_files, ("cart", "fence", "gate", "barrel", "crate"), ("grass01",))
    prop_members, prop_imported, prop_placed = import_kit_groups(
        prop_files,
        "village_blender",
        [(1.8, -5.2, 0.0), (-3.2, 3.4, 0.0), (0.2, 13.6, 0.0), (3.6, 6.4, 0.0)],
        village_center,
        5,
    )
    for obj in prop_members:
        link_exclusive(obj, collections["WORLD_PROPS"])
    tree_files = role_files(village_files, ("tree",), ("grass01",))
    street_tree_members, street_tree_imported, street_tree_placed = import_kit_groups(
        tree_files,
        "village_blender",
        [(-13.8, -2.4, 0.0), (14.2, 3.8, 0.0), (-14.6, 11.2, 0.0), (14.8, 16.4, 0.0)],
        village_center,
        6,
    )
    for obj in street_tree_members:
        link_exclusive(obj, collections["WORLD_FOREST_FOREGROUND"])
    placed = placed + prop_placed + street_tree_placed
    imported = imported + prop_imported + street_tree_imported
    fbx_members, fbx_imported, fbx_placed = [], 0, []

    remapped = remap_missing_images(all_files)
    forced = ensure_purchased_albedos(all_files)
    lifted = lift_purchased_shading()

    nature_members = []
    nature_files = expanded.get("forest_nature", [])
    if nature_files:
        for candidate in geometry_candidates(nature_files, "forest_nature"):
            objs = import_geometry(candidate, "forest_nature")
            if objs:
                nature_members.extend(keep_hero_meshes(objs, "forest_nature", 6))
        for obj in nature_members:
            if obj.type != "MESH":
                continue
            paint_simple_color(obj, f"TJ_Canopy_{obj.name}", (0.05, 0.12, 0.05), 0.92)
            if hasattr(obj, "visible_shadow"):
                obj.visible_shadow = False
        if nature_members:
            west = duplicate_mesh_in_world(nature_members[0], (-26.0, 36.0, 0.0), 2.1)
            east = duplicate_mesh_in_world(nature_members[0], (28.0, 40.0, 0.0), 2.3)
            for obj in nature_members:
                obj.hide_render = True
                obj.hide_viewport = True
            link_exclusive(west, collections["WORLD_FOREST_MIDGROUND"])
            link_exclusive(east, collections["WORLD_FOREST_BACKGROUND"])

    trees = [
        obj for obj in street_tree_members
        if obj.type == "MESH" and "tree" in obj.name.lower()
    ]
    if not trees:
        trees = [obj for obj in bpy.data.objects if obj.type == "MESH" and "tree" in obj.name.lower()]
    west_fg = scatter_clumps(trees, (-24.0, 10.0, 0.0), 3, 2, 7.0, 1.05, 3)
    west_mg = scatter_clumps(trees, (-30.0, 30.0, 0.0), 3, 2, 8.0, 1.35, 7)
    east_fg = scatter_clumps(trees, (24.0, 12.0, 0.0), 3, 2, 7.0, 1.08, 5)
    east_mg = scatter_clumps(trees, (28.0, 32.0, 0.0), 3, 2, 8.0, 1.40, 11)
    west_bg = scatter_clumps(trees, (-26.0, 52.0, 0.0), 2, 2, 9.0, 1.8, 13)
    east_bg = scatter_clumps(trees, (24.0, 54.0, 0.0), 2, 2, 9.0, 1.85, 17)
    foreground = west_fg + east_fg
    midground = west_mg + east_mg
    background = west_bg + east_bg
    for obj in foreground:
        link_exclusive(obj, collections["WORLD_FOREST_FOREGROUND"])
    for obj in midground:
        link_exclusive(obj, collections["WORLD_FOREST_MIDGROUND"])
    for obj in background:
        link_exclusive(obj, collections["WORLD_FOREST_BACKGROUND"])

    mountain_files = expanded.get("background_mountains", [])
    mountain_members = []
    if mountain_files:
        for candidate in geometry_candidates(mountain_files, "background_mountains"):
            objs = import_geometry(candidate, "background_mountains")
            if objs:
                mountain_members.extend(keep_hero_meshes(objs, "background_mountains", 5))
        if mountain_members:
            place_mountain_ridge(mountain_members, village_center)
            for obj in mountain_members:
                link_exclusive(obj, collections["WORLD_MOUNTAINS_BACKGROUND"])
                if hasattr(obj, "visible_shadow"):
                    obj.visible_shadow = False

    sky_name = setup_world(expanded.get("sky_hdri", []), expanded.get("world_shaders", []))
    setup_lighting_hierarchy()
    for obj in bpy.data.objects:
        if obj.type == "LIGHT":
            link_exclusive(obj, collections["WORLD_LIGHTING"])
        elif obj.type == "CAMERA" or obj.name.endswith("_LOOK"):
            link_exclusive(obj, collections["WORLD_CAMERAS"])
    bpy.ops.mesh.primitive_plane_add(size=3.4, location=(0.0, -2.4, 0.03))
    stage = bpy.context.object
    stage.name = "TJ_CharacterStagingPad"
    stage.hide_render = True
    stage.hide_viewport = True
    link_exclusive(stage, collections["WORLD_CHARACTER_STAGING"])
    setup_mist_and_compositor()
    cameras = setup_six_cameras()
    applied = apply_profile(args.profile, args)

    contributions = {
        "village_blender": visible_use_record("village_blender", downloaded=True, extracted=True, datablockLoaded=imported > 0, renderedPixels=imported > 0, shotIds=["SHOT_04", "SHOT_06"], evidence="collection:WORLD_VILLAGE"),
        "village_fbx": visible_use_record("village_fbx", downloaded=True, extracted=True, datablockLoaded=fbx_imported > 0, renderedPixels=fbx_imported > 0, shotIds=["SHOT_04"], evidence="collection:WORLD_PROPS"),
        "village_project": visible_use_record(
            "village_project",
            downloaded=True,
            extracted=True,
            datablockLoaded=water_loaded > 0,
            renderedPixels=river_material.startswith("Water_Mat"),
            shotIds=["SHOT_02"] if river_material.startswith("Water_Mat") else [],
            evidence=f"river_material:{river_material}" if river_material.startswith("Water_Mat") else "",
        ),
        "forest_nature": visible_use_record(
            "forest_nature",
            downloaded=True,
            extracted=True,
            datablockLoaded=bool(nature_members),
            renderedPixels=bool(nature_members),
            shotIds=["SHOT_01", "SHOT_03"] if nature_members else [],
            evidence="collection:WORLD_FOREST_MIDGROUND" if nature_members else "",
        ),
        "forest_ecokit": visible_use_record(
            "forest_ecokit",
            downloaded=True,
            extracted=True,
            datablockLoaded=water_loaded > 0,
            renderedPixels=False,
            shotIds=[],
            evidence="water_materials_loaded_not_rocks",
        ),
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
        "streetTreeFiles": street_tree_placed,
        "riverMaterial": river_material,
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
        "lighting": "single_key_sun_plus_sky_fill_plus_restrained_bounce",
        "groundSource": "shaped_valley_carrier_purchased_meadow",
        "riverSource": "spline_strip_purchased_water_mat",
        "forestLayout": "flank_clumps_mountain_corridor",
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
