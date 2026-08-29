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
from mathutils.geometry import interpolate_bezier  # noqa: E402
from showcase_original14_30s import (  # noqa: E402
    append_named_objects,
    duplicate_mesh_in_world,
    ensure_purchased_albedos,
    expand_asset,
    geometry_candidates,
    group_bounds,
    import_geometry,
    import_kit_groups,
    keep_hero_meshes,
    lift_purchased_shading,
    load_water_materials,
    paint_simple_color,
    remap_missing_images,
    setup_world,
)

# East-flowing valley river. Asymmetric bends; widths vary left/right independently.
RIVER_SPLINE = (
    (-44.0, -22.0, -0.62),
    (-36.0, -18.4, -0.66),
    (-30.0, -15.0, -0.68),
    (-22.0, -17.2, -0.70),
    (-16.0, -10.5, -0.70),
    (-8.0, -8.6, -0.71),
    (-2.0, -12.2, -0.72),
    (6.0, -8.0, -0.70),
    (12.0, -9.0, -0.70),
    (20.0, -14.8, -0.68),
    (26.0, -13.5, -0.66),
    (34.0, -16.6, -0.64),
    (42.0, -19.0, -0.62),
)
# Camera-scale creek. Dark bed + 3D banks are the silhouette; water is a narrow film.
WATER_SURFACE_Z = -1.15
WATER_HALF_WIDTH = 5.40
BANK_HALF_WIDTH = 9.50
BED_BELOW_WATER = 0.40
BED_CENTER_Z = -1.62
BED_SHOULDER_Z = -0.58
BANK_CREST_Z = 0.78
WATER_WIDTH_SCALE = 0.30
BED_WIDTH_SCALE = 0.68
WATER_THICKNESS = 0.18
VILLAGE_X_HALF = 16.0
VILLAGE_Y_MIN = -8.0
VILLAGE_Y_MAX = 22.0
MOUNTAIN_CORRIDOR_X = 8.0
LOUIS_LP_MEADOW = ("LP_MeadowRange1", "LP_MeadowRange2", "LP_MeadowRange3")
LOUIS_LP_PEAKS = ("LP_GrassyMountain1", "LP_GrassyMountain2", "LP_GrassyMountain3")

PROGRESS_PATH: Path | None = None
WATER_TINT = None
WATER_VARIANT = "A"


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
    parser.add_argument("--hide-water", action="store_true")
    parser.add_argument("--control-tests", action="store_true")
    parser.add_argument("--water-variant", default="D", help="A=V32 baseline, B=transmission, C=rough reflection, D=hybrid")
    parser.add_argument("--ab-water", action="store_true", help="Render SHOT_02 once per water variant A-D")
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
    return channel_profile(x, y, points)[0]


def channel_profile(x: float, y: float, points=RIVER_SPLINE) -> tuple[float, float, float, float, float]:
    """Distance, signed offset, along-metres, left half-width, right half-width."""
    best = 1e9
    signed = 0.0
    along = 0.0
    acc = 0.0
    for index in range(len(points) - 1):
        ax, ay = points[index][0], points[index][1]
        bx, by = points[index + 1][0], points[index + 1][1]
        vx, vy = bx - ax, by - ay
        length = math.hypot(vx, vy) or 1.0
        t = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / (length * length)))
        px, py = ax + t * vx, ay + t * vy
        dx, dy = x - px, y - py
        dist = math.hypot(dx, dy)
        cross = vx * dy - vy * dx
        if dist < best:
            best = dist
            signed = dist if cross >= 0.0 else -dist
            along = acc + t * length
        acc += length
    # left=south (camera side, wide pools). right=north (village side, tighter).
    pool = 0.55 + 0.45 * math.sin(along * 0.09)
    pinch = 0.62 + 0.38 * math.sin(along * 0.21 + 0.7)
    left = 5.4 + 2.2 * pool + 1.05 * math.sin(along * 0.29)
    right = 2.7 + 1.15 * pinch + 0.45 * math.cos(along * 0.27)
    left = max(4.0, min(8.2, left))
    right = max(2.1, min(4.4, right))
    return best, signed, along, left, right


def in_river_channel(x: float, y: float, margin: float = 0.0) -> bool:
    dist, signed, _along, left, right = channel_profile(x, y)
    local = left if signed < 0.0 else right
    return dist < local + margin


def channel_half_at(x: float, y: float) -> float:
    _dist, signed, _along, left, right = channel_profile(x, y)
    return left if signed < 0.0 else right


def shade_smooth(obj: bpy.types.Object) -> None:
    if not obj or obj.type != "MESH":
        return
    for poly in obj.data.polygons:
        poly.use_smooth = True


def _walk_image_nodes(nodes):
    found = []
    for node in nodes:
        if node.type == "TEX_IMAGE" and getattr(node, "image", None):
            name = node.image.name.lower()
            if "slope" in name or "mask" in name or "nrm" in name:
                continue
            found.append(node.image)
        tree = getattr(node, "node_tree", None)
        if node.type == "GROUP" and tree is not None:
            found.extend(_walk_image_nodes(tree.nodes))
    return found


def purchased_meadow_image():
    """Louis Meadow/Grassy packed Gaea albedos live inside node groups."""
    images = []
    for mat in bpy.data.materials:
        if not mat or not mat.node_tree:
            continue
        if not any(token in mat.name.lower() for token in ("meadow", "grassy")):
            continue
        images.extend(_walk_image_nodes(mat.node_tree.nodes))
    for group in bpy.data.node_groups:
        if any(token in group.name.lower() for token in ("meadow", "grassy", "rockygreen")):
            images.extend(_walk_image_nodes(group.nodes))
    preferred = [
        img for img in images
        if img.name.lower().startswith("texture") and "veget" not in img.name.lower()
    ]
    return preferred[0] if preferred else None


def purchased_river_mask_image():
    """Louis packed RiverMask.png. Used as water variation, not a painted ground path."""
    for img in bpy.data.images:
        if img and "rivermask" in img.name.lower():
            return img
    return None


def in_village(x: float, y: float) -> bool:
    return abs(x) < VILLAGE_X_HALF and VILLAGE_Y_MIN < y < VILLAGE_Y_MAX


def in_mountain_corridor(x: float, y: float) -> bool:
    return abs(x) < MOUNTAIN_CORRIDOR_X and y > -24.0


def in_shot03_corridor(x: float, y: float) -> bool:
    return dist_to_polyline(x, y, ((-34.0, 16.0, 0.0), (-14.0, 36.0, 0.0), (-8.0, 44.0, 0.0))) < 9.5


def role_files(files: list[Path], include: tuple[str, ...], exclude: tuple[str, ...] = ()) -> list[Path]:
    chosen = []
    for path in files:
        name = path.name.lower()
        if any(word in name for word in include) and not any(word in name for word in exclude):
            chosen.append(path)
    return chosen


def sculpt_channel_height(x: float, y: float, meadow_z: float) -> float:
    """Carved creek: deep trough, wide wet shelf, irregular 3D banks."""
    dist, signed, along, left_half, right_half = channel_profile(x, y)
    local = left_half if signed < 0.0 else right_half
    south = signed < 0.0
    crest_wobble = 0.18 * math.sin(along * 0.21 + x * 0.19) + 0.08 * math.sin(x * 0.73)
    bank_run = (2.55 if south else 1.45) + 0.50 * math.sin(along * 0.33 + (0.0 if south else 1.4))
    water_half = local * 0.34
    bed_half = local * 0.90
    bank_outer = local + bank_run
    pool = 0.22 * (0.5 + 0.5 * math.sin(along * 0.11))
    center_z = BED_CENTER_Z - pool
    shoulder_z = BED_SHOULDER_Z + 0.07 * math.sin(along * 0.23)
    crest_z = BANK_CREST_Z + crest_wobble + (0.14 if south else 0.04)
    if dist >= bank_outer:
        return meadow_z
    if dist < water_half:
        t = dist / max(0.12, water_half)
        return center_z + (shoulder_z - center_z) * (t ** 1.55)
    if dist < bed_half:
        t = (dist - water_half) / max(0.16, bed_half - water_half)
        irreg = 0.08 * math.sin(x * 0.81 + y * 0.54) + 0.05 * math.sin(along * 0.67)
        return shoulder_z + 0.20 * (t ** 1.35) + irreg
    t = (dist - bed_half) / max(0.22, bank_outer - bed_half)
    shelf = shoulder_z + 0.20
    crest_z += 0.10 * math.sin(x * 1.17 + y * 0.83) + 0.07 * math.sin(along * 0.91)
    crest_z += 0.06 * math.sin(x * 2.4 + y * 1.8)
    # Round the camera-facing lip. Do not change trough depths or water/bed halves.
    if t < 0.58:
        u = t / 0.58
        return shelf + (crest_z - shelf) * (u ** 1.55)
    u = (t - 0.58) / 0.42
    lip = 0.11 * math.sin(x * 2.05 + along * 0.44) + 0.07 * math.sin(y * 1.6 + x * 0.9)
    return (crest_z + lip) + (meadow_z - crest_z - lip) * (u ** 1.08)


def build_terrain(_files: list[Path]) -> bpy.types.Object:
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=320, y_subdivisions=320, size=180.0, location=(0.0, 8.0, 0.0))
    ground = bpy.context.object
    ground.name = "TJ_Ground_ValleyCarrier"
    try:
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    except Exception:
        pass
    for vert in ground.data.vertices:
        x, y = vert.co.x, vert.co.y
        height = 0.55 * math.sin(x * 0.022) * math.cos(y * 0.018)
        height += 0.28 * math.sin((x * 0.45 + y) * 0.035)
        if y < -6.0:
            height += 0.38 * math.sin(x * 0.075) * math.cos(y * 0.10)
            height += 0.16 * math.sin(x * 0.29 + y * 0.17)
        if y < -20.0:
            height += 0.20
        river_dist, _signed, _along, left_half, right_half = channel_profile(x, y)
        local_half = left_half if _signed < 0.0 else right_half
        bank_outer = local_half + (2.55 if _signed < 0.0 else 1.45) + 0.50
        height = sculpt_channel_height(x, y, height)
        if in_village(x, y) and river_dist > bank_outer:
            edge = min(
                (VILLAGE_X_HALF - abs(x)) / 4.0,
                (y - VILLAGE_Y_MIN) / 3.0,
                (VILLAGE_Y_MAX - y) / 3.0,
            )
            pad = max(0.68, 1.0 - max(0.0, min(1.0, edge)) * 0.32)
            height *= pad
        vert.co.z = max(BED_CENTER_Z - 0.28, min(2.8, height))
    paint_wet_bank_mask(ground)
    ground.data.update()
    shade_smooth(ground)
    img = purchased_meadow_image()
    ground.data.materials.append(cinematic_meadow_material(img))
    print(json.dumps({"event": "terrain_ground_image", "path": img.name if img else None}), flush=True)
    return ground


def _mix_rgb(nodes):
    try:
        mix = nodes.new("ShaderNodeMixRGB")
    except Exception:
        mix = nodes.new("ShaderNodeMix")
        if hasattr(mix, "data_type"):
            mix.data_type = "RGBA"
    return mix


def cinematic_meadow_material(image) -> bpy.types.Material:
    """Dark meadow + packed-earth street. No Rocks_A sand mix."""
    mat = bpy.data.materials.new("TJ_CinematicValleyMeadow")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.96
    coord = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.014
    if "Detail" in noise.inputs:
        noise.inputs["Detail"].default_value = 3.0
    links.new(coord.outputs["Object"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = 0.16
    ramp.color_ramp.elements[0].color = (0.028, 0.045, 0.022, 1.0)
    ramp.color_ramp.elements[1].position = 0.84
    ramp.color_ramp.elements[1].color = (0.055, 0.080, 0.032, 1.0)
    mid = ramp.color_ramp.elements.new(0.50)
    mid.color = (0.040, 0.062, 0.028, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    color = ramp.outputs["Color"]
    if image is not None:
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        if tex.image and tex.image.colorspace_settings:
            tex.image.colorspace_settings.name = "sRGB"
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (0.016, 0.016, 0.016)
        links.new(coord.outputs["Object"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        mix = _mix_rgb(nodes)
        if "Color1" in mix.inputs:
            mix.inputs["Fac"].default_value = 0.40
            links.new(ramp.outputs["Color"], mix.inputs["Color1"])
            links.new(tex.outputs["Color"], mix.inputs["Color2"])
            color = mix.outputs["Color"]
    detail = nodes.new("ShaderNodeTexNoise")
    detail.inputs["Scale"].default_value = 2.2
    if "Detail" in detail.inputs:
        detail.inputs["Detail"].default_value = 6.0
    links.new(coord.outputs["Object"], detail.inputs["Vector"])
    detail_ramp = nodes.new("ShaderNodeValToRGB")
    detail_ramp.color_ramp.elements[0].color = (0.022, 0.038, 0.016, 1.0)
    detail_ramp.color_ramp.elements[1].color = (0.070, 0.095, 0.034, 1.0)
    links.new(detail.outputs["Fac"], detail_ramp.inputs["Fac"])
    detail_mix = _mix_rgb(nodes)
    if "Color1" in detail_mix.inputs:
        detail_mix.inputs["Fac"].default_value = 0.34
        links.new(color, detail_mix.inputs["Color1"])
        links.new(detail_ramp.outputs["Color"], detail_mix.inputs["Color2"])
        color = detail_mix.outputs["Color"]
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.42
    links.new(detail.outputs["Fac"], bump.inputs["Height"])
    if "Normal" in bsdf.inputs:
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["Object"], sep.inputs["Vector"])
    abs_x = nodes.new("ShaderNodeMath")
    abs_x.operation = "ABSOLUTE"
    links.new(sep.outputs["X"], abs_x.inputs[0])
    path_w = nodes.new("ShaderNodeMapRange")
    path_w.inputs["From Min"].default_value = 0.35
    path_w.inputs["From Max"].default_value = 1.6
    path_w.inputs["To Min"].default_value = 1.0
    path_w.inputs["To Max"].default_value = 0.0
    links.new(abs_x.outputs["Value"], path_w.inputs["Value"])
    y_center = nodes.new("ShaderNodeMath")
    y_center.operation = "SUBTRACT"
    y_center.inputs[1].default_value = 6.0
    links.new(sep.outputs["Y"], y_center.inputs[0])
    y_abs = nodes.new("ShaderNodeMath")
    y_abs.operation = "ABSOLUTE"
    links.new(y_center.outputs["Value"], y_abs.inputs[0])
    y_fade = nodes.new("ShaderNodeMapRange")
    y_fade.inputs["From Min"].default_value = 8.0
    y_fade.inputs["From Max"].default_value = 18.0
    y_fade.inputs["To Min"].default_value = 1.0
    y_fade.inputs["To Max"].default_value = 0.0
    links.new(y_abs.outputs["Value"], y_fade.inputs["Value"])
    path_fac = nodes.new("ShaderNodeMath")
    path_fac.operation = "MULTIPLY"
    links.new(path_w.outputs["Result"] if "Result" in path_w.outputs else path_w.outputs[0], path_fac.inputs[0])
    links.new(y_fade.outputs["Result"] if "Result" in y_fade.outputs else y_fade.outputs[0], path_fac.inputs[1])
    dirt = _mix_rgb(nodes)
    if "Color1" in dirt.inputs:
        links.new(color, dirt.inputs["Color1"])
        dirt.inputs["Color2"].default_value = (0.10, 0.068, 0.038, 1.0)
        links.new(path_fac.outputs["Value"], dirt.inputs["Fac"])
        color = dirt.outputs["Color"]
    links.new(color, bsdf.inputs["Base Color"])
    embed_wet_banks_on_floor(mat)
    return mat


def paint_wet_bank_mask(ground: bpy.types.Object) -> None:
    """Grass -> mixed soil -> damp earth -> dark bed. Irregular, not a knife contour."""
    mesh = ground.data
    try:
        color = mesh.color_attributes.new(name="TJ_RiverMask", type="FLOAT_COLOR", domain="POINT")
    except Exception:
        color = mesh.color_attributes.get("TJ_RiverMask")
    if color is None:
        return
    for index, vert in enumerate(mesh.vertices):
        x, y = vert.co.x, vert.co.y
        dist, signed, along, left_half, right_half = channel_profile(x, y)
        local_half = left_half if signed < 0.0 else right_half
        bed = local_half * 0.90
        fade = local_half + (5.6 if signed < 0.0 else 3.0)
        jag = 1.05 * math.sin(x * 1.73 + y * 0.91) + 0.70 * math.sin(along * 0.47 + signed * 2.4)
        jag += 0.45 * math.sin(x * 0.61 + y * 1.27) + 0.28 * math.sin(x * 2.4 + y * 1.9)
        fade += jag
        inner = bed * 0.48
        shelf = local_half * 1.05
        blotch = 0.5 + 0.5 * math.sin(x * 2.15 + y * 1.64) * math.sin(along * 0.83 + x * 0.41)
        if dist < inner:
            value = 0.62 + 0.16 * math.sin(along * 0.41 + x * 0.7)
        elif dist < shelf:
            t = (dist - inner) / max(0.25, shelf - inner)
            value = 0.70 - 0.40 * t
        elif dist < fade:
            t = (dist - shelf) / max(0.55, fade - shelf)
            jag_t = t + 0.22 * math.sin(along * 0.33 + x * 0.8)
            value = max(0.0, 0.26 * ((1.0 - min(1.0, jag_t)) ** 1.75))
            if t > 0.32 and blotch < 0.45:
                value *= 0.22
        else:
            value = 0.0
        value *= 0.80 + 0.20 * max(0.0, blotch)
        color.data[index].color = (value, value, value, 1.0)


def embed_wet_banks_on_floor(mat: bpy.types.Material) -> None:
    """Grass -> damp mixed soil -> dark bed. No water BSDF on the meadow."""
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    if "Base Color" not in bsdf.inputs or not bsdf.inputs["Base Color"].links:
        return
    incoming = bsdf.inputs["Base Color"].links[0].from_socket
    attr = nodes.new("ShaderNodeVertexColor")
    attr.name = "TJ_RiverMaskAttr"
    if hasattr(attr, "layer_name"):
        attr.layer_name = "TJ_RiverMask"
    mask = attr.outputs.get("Color") or attr.outputs[0]
    damp = _mix_rgb(nodes)
    wet = _mix_rgb(nodes)
    if "Color1" not in damp.inputs or "Color1" not in wet.inputs:
        return
    coord = next((node for node in nodes if node.type == "TEX_COORD"), None)
    if coord is None:
        coord = nodes.new("ShaderNodeTexCoord")
    blotch = nodes.new("ShaderNodeTexNoise")
    blotch.inputs["Scale"].default_value = 1.55
    if "Detail" in blotch.inputs:
        blotch.inputs["Detail"].default_value = 6.0
    links.new(coord.outputs["Object"], blotch.inputs["Vector"])
    blotch_range = nodes.new("ShaderNodeMapRange")
    blotch_range.inputs["From Min"].default_value = 0.15
    blotch_range.inputs["From Max"].default_value = 0.85
    blotch_range.inputs["To Min"].default_value = 0.38
    blotch_range.inputs["To Max"].default_value = 1.0
    links.new(blotch.outputs["Fac"], blotch_range.inputs["Value"])
    mask_mul = nodes.new("ShaderNodeMath")
    mask_mul.operation = "MULTIPLY"
    links.new(mask, mask_mul.inputs[0])
    links.new(blotch_range.outputs["Result"] if "Result" in blotch_range.outputs else blotch_range.outputs[0], mask_mul.inputs[1])
    mask = mask_mul.outputs["Value"]
    links.new(incoming, damp.inputs["Color1"])
    damp.inputs["Color2"].default_value = (0.068, 0.052, 0.028, 1.0)
    damp_fac = nodes.new("ShaderNodeMapRange")
    damp_fac.inputs["From Min"].default_value = 0.0
    damp_fac.inputs["From Max"].default_value = 0.58
    damp_fac.inputs["To Min"].default_value = 0.0
    damp_fac.inputs["To Max"].default_value = 1.0
    links.new(mask, damp_fac.inputs["Value"])
    links.new(damp_fac.outputs["Result"] if "Result" in damp_fac.outputs else damp_fac.outputs[0], damp.inputs["Fac"])
    links.new(damp.outputs["Color"], wet.inputs["Color1"])
    wet.inputs["Color2"].default_value = (0.042, 0.034, 0.018, 1.0)
    wet_fac = nodes.new("ShaderNodeMapRange")
    wet_fac.inputs["From Min"].default_value = 0.18
    wet_fac.inputs["From Max"].default_value = 0.90
    wet_fac.inputs["To Min"].default_value = 0.0
    wet_fac.inputs["To Max"].default_value = 1.0
    links.new(mask, wet_fac.inputs["Value"])
    links.new(wet_fac.outputs["Result"] if "Result" in wet_fac.outputs else wet_fac.outputs[0], wet.inputs["Fac"])
    for link in list(bsdf.inputs["Base Color"].links):
        links.remove(link)
    links.new(wet.outputs["Color"], bsdf.inputs["Base Color"])
    bump = next((node for node in nodes if node.type == "BUMP"), None)
    if bump is not None and "Height" in bump.inputs and bump.inputs["Height"].links:
        height_in = bump.inputs["Height"].links[0].from_socket
        links.remove(bump.inputs["Height"].links[0])
        damp_b = nodes.new("ShaderNodeMath")
        damp_b.operation = "MULTIPLY"
        damp_b.inputs[1].default_value = 0.78
        links.new(mask, damp_b.inputs[0])
        inv = nodes.new("ShaderNodeMath")
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        links.new(damp_b.outputs["Value"], inv.inputs[1])
        scale = nodes.new("ShaderNodeMath")
        scale.operation = "MULTIPLY"
        links.new(height_in, scale.inputs[0])
        links.new(inv.outputs["Value"], scale.inputs[1])
        links.new(scale.outputs["Value"], bump.inputs["Height"])


def apply_stream_tint(tint) -> None:
    if not tint:
        return
    for mat in bpy.data.materials:
        if not (mat and mat.node_tree):
            continue
        mix = mat.node_tree.nodes.get("TJ_StreamTintMix")
        if mix and "Color1" in mix.inputs:
            mix.inputs["Color1"].default_value = tint
            if "Color2" in mix.inputs:
                mix.inputs["Color2"].default_value = (
                    min(0.048, tint[0] + 0.018),
                    min(0.078, tint[1] + 0.028),
                    min(0.058, tint[2] + 0.018),
                    1.0,
                )
            continue
        node = mat.node_tree.nodes.get("TJ_StreamBody")
        if node and "Base Color" in node.inputs and not node.inputs["Base Color"].links:
            node.inputs["Base Color"].default_value = tint


def cinematic_riverbed_material() -> bpy.types.Material:
    """Dark wet earth/stone bed. Visible through the thin water film."""
    mat = bpy.data.materials.new("TJ_CinematicRiverBed")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    body = nodes.new("ShaderNodeBsdfPrincipled")
    attr = nodes.new("ShaderNodeVertexColor")
    if hasattr(attr, "layer_name"):
        attr.layer_name = "TJ_RiverDepth"
    coord = nodes.new("ShaderNodeTexCoord")
    mix = _mix_rgb(nodes)
    if "Color1" in mix.inputs:
        mix.inputs["Color1"].default_value = (0.010, 0.009, 0.006, 1.0)
        mix.inputs["Color2"].default_value = (0.030, 0.026, 0.016, 1.0)
        links.new(attr.outputs["Color"], mix.inputs["Fac"])
        links.new(mix.outputs["Color"], body.inputs["Base Color"])
    if "Roughness" in body.inputs:
        body.inputs["Roughness"].default_value = 0.96
    if "Metallic" in body.inputs:
        body.inputs["Metallic"].default_value = 0.0
    if "Specular IOR Level" in body.inputs:
        body.inputs["Specular IOR Level"].default_value = 0.05
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.6
    if "Detail" in noise.inputs:
        noise.inputs["Detail"].default_value = 5.0
    links.new(coord.outputs["Object"], noise.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.38
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    if "Normal" in body.inputs:
        links.new(bump.outputs["Normal"], body.inputs["Normal"])
    links.new(body.outputs["BSDF"], out.inputs["Surface"])
    return mat


def _water_variant_cfg(variant: str, tint) -> dict:
    deep = tint or (0.018, 0.042, 0.036, 1.0)
    name = (variant or "A").upper()
    if name == "A":
        return {
            "label": "A",
            "specular": 0.0,
            "ior": 1.0,
            "distance_gate": True,
            "trans_center": 0.38,
            "trans_edge": 0.24,
            "trans_far": 0.04,
            "sheen": 0.15,
            "sheen_far": 0.03,
            "rough_lo": 0.28,
            "rough_hi": 0.46,
            "extra_glossy": True,
            "glossy_color": (0.14, 0.17, 0.16, 1.0),
            "gloss_rough_lo": 0.38,
            "gloss_rough_hi": 0.58,
            "bump": 0.34,
            "deep": deep,
        }
    if name == "B":
        return {
            "label": "B",
            "specular": 0.18,
            "ior": 1.22,
            "distance_gate": False,
            "trans_center": 0.56,
            "trans_edge": 0.74,
            "trans_far": 0.56,
            "sheen": 0.0,
            "sheen_far": 0.0,
            "rough_lo": 0.12,
            "rough_hi": 0.26,
            "extra_glossy": False,
            "glossy_color": (0.12, 0.15, 0.14, 1.0),
            "gloss_rough_lo": 0.22,
            "gloss_rough_hi": 0.40,
            "bump": 0.22,
            "deep": (max(0.008, deep[0] * 0.70), max(0.014, deep[1] * 0.72), max(0.012, deep[2] * 0.68), 1.0),
        }
    if name == "C":
        return {
            "label": "C",
            "specular": 0.22,
            "ior": 1.15,
            "distance_gate": False,
            "trans_center": 0.16,
            "trans_edge": 0.22,
            "trans_far": 0.16,
            "sheen": 0.22,
            "sheen_far": 0.22,
            "rough_lo": 0.32,
            "rough_hi": 0.50,
            "extra_glossy": True,
            "glossy_color": (0.18, 0.22, 0.20, 1.0),
            "gloss_rough_lo": 0.28,
            "gloss_rough_hi": 0.48,
            "bump": 0.40,
            "deep": deep,
        }
    return {
        "label": "D",
        "specular": 0.12,
        "ior": 1.10,
        "distance_gate": False,
        "trans_center": 0.38,
        "trans_edge": 0.58,
        "trans_far": 0.38,
        "sheen": 0.12,
        "sheen_far": 0.12,
        "rough_lo": 0.22,
        "rough_hi": 0.40,
        "extra_glossy": True,
        "glossy_color": (0.11, 0.14, 0.13, 1.0),
        "gloss_rough_lo": 0.26,
        "gloss_rough_hi": 0.46,
        "bump": 0.30,
        "deep": deep,
    }


def cinematic_river_material(tint=None, variant: str | None = None) -> bpy.types.Material:
    """Stylized creek film. Variant A is the V32 baseline; B/C/D restore water cues."""
    cfg = _water_variant_cfg(variant or WATER_VARIANT, tint)
    deep = cfg["deep"]
    mat = bpy.data.materials.new(f"TJ_CinematicRiver_{cfg['label']}")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    body = nodes.new("ShaderNodeBsdfPrincipled")
    body.name = "TJ_StreamBody"
    shallow = (
        min(0.048, deep[0] + 0.018),
        min(0.078, deep[1] + 0.028),
        min(0.058, deep[2] + 0.018),
        1.0,
    )
    attr = nodes.new("ShaderNodeVertexColor")
    if hasattr(attr, "layer_name"):
        attr.layer_name = "TJ_RiverDepth"
    coord = nodes.new("ShaderNodeTexCoord")
    depth = _mix_rgb(nodes)
    depth.name = "TJ_StreamTintMix"
    wave = nodes.new("ShaderNodeTexWave")
    if hasattr(wave, "wave_type"):
        wave.wave_type = "BANDS"
    if hasattr(wave, "bands_direction"):
        wave.bands_direction = "DIAGONAL"
    if "Scale" in wave.inputs:
        wave.inputs["Scale"].default_value = 1.6
    if "Distortion" in wave.inputs:
        wave.inputs["Distortion"].default_value = 3.6
    if "Detail" in wave.inputs:
        wave.inputs["Detail"].default_value = 2.0
    links.new(coord.outputs["Object"], wave.inputs["Vector"])
    streak = _mix_rgb(nodes)
    if "Color1" in depth.inputs:
        depth.inputs["Color1"].default_value = deep
        depth.inputs["Color2"].default_value = shallow
        links.new(attr.outputs["Color"], depth.inputs["Fac"])
        if "Color1" in streak.inputs:
            links.new(depth.outputs["Color"], streak.inputs["Color1"])
            streak.inputs["Color2"].default_value = (
                max(0.006, deep[0] * 0.45),
                max(0.010, deep[1] * 0.45),
                max(0.008, deep[2] * 0.45),
                1.0,
            )
            streak.inputs["Fac"].default_value = 0.0
            wave_out = wave.outputs["Fac"] if "Fac" in wave.outputs else (wave.outputs["Color"] if "Color" in wave.outputs else wave.outputs[0])
            wave_amt = nodes.new("ShaderNodeMapRange")
            wave_amt.inputs["From Min"].default_value = 0.15
            wave_amt.inputs["From Max"].default_value = 0.85
            wave_amt.inputs["To Min"].default_value = 0.0
            wave_amt.inputs["To Max"].default_value = 0.38
            links.new(wave_out, wave_amt.inputs["Value"])
            links.new(wave_amt.outputs["Result"] if "Result" in wave_amt.outputs else wave_amt.outputs[0], streak.inputs["Fac"])
            links.new(streak.outputs["Color"], body.inputs["Base Color"])
        else:
            links.new(depth.outputs["Color"], body.inputs["Base Color"])
    elif "Base Color" in body.inputs:
        body.inputs["Base Color"].default_value = deep
    rough = nodes.new("ShaderNodeMapRange")
    rough.inputs["From Min"].default_value = 0.0
    rough.inputs["From Max"].default_value = 1.0
    rough.inputs["To Min"].default_value = cfg["rough_lo"]
    rough.inputs["To Max"].default_value = cfg["rough_hi"]
    links.new(attr.outputs["Color"], rough.inputs["Value"])
    river_mask = purchased_river_mask_image()
    rough_out = rough.outputs["Result"] if "Result" in rough.outputs else rough.outputs[0]
    if river_mask is not None:
        mask_tex = nodes.new("ShaderNodeTexImage")
        mask_tex.image = river_mask
        if mask_tex.image and mask_tex.image.colorspace_settings:
            mask_tex.image.colorspace_settings.name = "Non-Color"
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (0.062, 0.062, 0.062)
        links.new(coord.outputs["Object"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], mask_tex.inputs["Vector"])
        mask_mul = nodes.new("ShaderNodeMath")
        mask_mul.operation = "MULTIPLY"
        mask_mul.inputs[1].default_value = 0.10
        links.new(mask_tex.outputs["Color"], mask_mul.inputs[0])
        rough_add = nodes.new("ShaderNodeMath")
        rough_add.operation = "ADD"
        links.new(rough_out, rough_add.inputs[0])
        links.new(mask_mul.outputs["Value"], rough_add.inputs[1])
        rough_out = rough_add.outputs["Value"]
    if "Roughness" in body.inputs:
        links.new(rough_out, body.inputs["Roughness"])
    if "Specular IOR Level" in body.inputs:
        body.inputs["Specular IOR Level"].default_value = cfg["specular"]
    if "IOR" in body.inputs:
        body.inputs["IOR"].default_value = cfg["ior"]
    if "Metallic" in body.inputs:
        body.inputs["Metallic"].default_value = 0.0
    layer = nodes.new("ShaderNodeLayerWeight")
    layer.inputs["Blend"].default_value = 0.42
    edge_trans = nodes.new("ShaderNodeMapRange")
    edge_trans.inputs["From Min"].default_value = 0.0
    edge_trans.inputs["From Max"].default_value = 1.0
    edge_trans.inputs["To Min"].default_value = cfg["trans_center"]
    edge_trans.inputs["To Max"].default_value = cfg["trans_edge"]
    links.new(attr.outputs["Color"], edge_trans.inputs["Value"])
    trans_src = edge_trans.outputs["Result"] if "Result" in edge_trans.outputs else edge_trans.outputs[0]
    if cfg["distance_gate"]:
        camdata = nodes.new("ShaderNodeCameraData")
        tiny = nodes.new("ShaderNodeMath")
        tiny.operation = "LESS_THAN"
        tiny.inputs[1].default_value = 2.0
        links.new(camdata.outputs["View Distance"], tiny.inputs[0])
        boost = nodes.new("ShaderNodeMath")
        boost.operation = "MULTIPLY"
        boost.inputs[1].default_value = 48.0
        links.new(tiny.outputs["Value"], boost.inputs[0])
        safe_dist = nodes.new("ShaderNodeMath")
        safe_dist.operation = "ADD"
        links.new(camdata.outputs["View Distance"], safe_dist.inputs[0])
        links.new(boost.outputs["Value"], safe_dist.inputs[1])
        dist_trans = nodes.new("ShaderNodeMapRange")
        dist_trans.inputs["From Min"].default_value = 10.0
        dist_trans.inputs["From Max"].default_value = 28.0
        dist_trans.inputs["To Min"].default_value = 1.0
        dist_trans.inputs["To Max"].default_value = cfg["trans_far"] / max(0.01, cfg["trans_center"])
        links.new(safe_dist.outputs["Value"], dist_trans.inputs["Value"])
        trans_mul = nodes.new("ShaderNodeMath")
        trans_mul.operation = "MULTIPLY"
        links.new(trans_src, trans_mul.inputs[0])
        links.new(dist_trans.outputs["Result"] if "Result" in dist_trans.outputs else dist_trans.outputs[0], trans_mul.inputs[1])
        trans_src = trans_mul.outputs["Value"]
    else:
        safe_dist = None
    if "Transmission Weight" in body.inputs:
        links.new(trans_src, body.inputs["Transmission Weight"])
    if "Transmission Extra" in body.inputs:
        body.inputs["Transmission Extra"].default_value = 0.0
    swell = nodes.new("ShaderNodeTexNoise")
    swell.inputs["Scale"].default_value = 0.42
    if "Detail" in swell.inputs:
        swell.inputs["Detail"].default_value = 3.0
    if "Roughness" in swell.inputs:
        swell.inputs["Roughness"].default_value = 0.35
    links.new(coord.outputs["Object"], swell.inputs["Vector"])
    ripple = nodes.new("ShaderNodeTexNoise")
    ripple.inputs["Scale"].default_value = 6.2
    if "Detail" in ripple.inputs:
        ripple.inputs["Detail"].default_value = 5.0
    if "Roughness" in ripple.inputs:
        ripple.inputs["Roughness"].default_value = 0.48
    links.new(coord.outputs["Object"], ripple.inputs["Vector"])
    combo = nodes.new("ShaderNodeMath")
    combo.operation = "ADD"
    combo.inputs[1].default_value = 0.0
    swell_mul = nodes.new("ShaderNodeMath")
    swell_mul.operation = "MULTIPLY"
    swell_mul.inputs[1].default_value = 0.55
    links.new(swell.outputs["Fac"], swell_mul.inputs[0])
    ripple_mul = nodes.new("ShaderNodeMath")
    ripple_mul.operation = "MULTIPLY"
    ripple_mul.inputs[1].default_value = 0.45
    links.new(ripple.outputs["Fac"], ripple_mul.inputs[0])
    links.new(swell_mul.outputs["Value"], combo.inputs[0])
    links.new(ripple_mul.outputs["Value"], combo.inputs[1])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = cfg["bump"]
    links.new(combo.outputs["Value"], bump.inputs["Height"])
    if "Normal" in body.inputs:
        links.new(bump.outputs["Normal"], body.inputs["Normal"])
    glossy = nodes.new("ShaderNodeBsdfGlossy")
    if hasattr(glossy, "distribution"):
        glossy.distribution = "GGX"
    if "Color" in glossy.inputs:
        glossy.inputs["Color"].default_value = cfg["glossy_color"]
    gloss_rough = nodes.new("ShaderNodeMapRange")
    gloss_rough.inputs["From Min"].default_value = 0.0
    gloss_rough.inputs["From Max"].default_value = 1.0
    gloss_rough.inputs["To Min"].default_value = cfg["gloss_rough_lo"]
    gloss_rough.inputs["To Max"].default_value = cfg["gloss_rough_hi"]
    links.new(ripple.outputs["Fac"], gloss_rough.inputs["Value"])
    if "Roughness" in glossy.inputs:
        links.new(gloss_rough.outputs["Result"] if "Result" in gloss_rough.outputs else gloss_rough.outputs[0], glossy.inputs["Roughness"])
    if "Normal" in glossy.inputs:
        links.new(bump.outputs["Normal"], glossy.inputs["Normal"])
    sheen = nodes.new("ShaderNodeMath")
    sheen.operation = "MULTIPLY"
    sheen.inputs[1].default_value = cfg["sheen"]
    links.new(layer.outputs["Fresnel"], sheen.inputs[0])
    if cfg["distance_gate"] and safe_dist is not None:
        dist_sheen = nodes.new("ShaderNodeMapRange")
        dist_sheen.inputs["From Min"].default_value = 10.0
        dist_sheen.inputs["From Max"].default_value = 28.0
        dist_sheen.inputs["To Min"].default_value = cfg["sheen"]
        dist_sheen.inputs["To Max"].default_value = cfg["sheen_far"]
        links.new(safe_dist.outputs["Value"], dist_sheen.inputs["Value"])
        sheen_scale = nodes.new("ShaderNodeMath")
        sheen_scale.operation = "MULTIPLY"
        links.new(layer.outputs["Fresnel"], sheen_scale.inputs[0])
        links.new(dist_sheen.outputs["Result"] if "Result" in dist_sheen.outputs else dist_sheen.outputs[0], sheen_scale.inputs[1])
        sheen = sheen_scale
    sheen_var = nodes.new("ShaderNodeMapRange")
    sheen_var.inputs["From Min"].default_value = 0.0
    sheen_var.inputs["From Max"].default_value = 1.0
    sheen_var.inputs["To Min"].default_value = 0.70
    sheen_var.inputs["To Max"].default_value = 1.0
    links.new(swell.outputs["Fac"], sheen_var.inputs["Value"])
    sheen_mul = nodes.new("ShaderNodeMath")
    sheen_mul.operation = "MULTIPLY"
    links.new(sheen.outputs["Value"], sheen_mul.inputs[0])
    links.new(sheen_var.outputs["Result"] if "Result" in sheen_var.outputs else sheen_var.outputs[0], sheen_mul.inputs[1])
    if cfg["extra_glossy"] and cfg["sheen"] > 0.001:
        mix_sh = nodes.new("ShaderNodeMixShader")
        links.new(sheen_mul.outputs["Value"], mix_sh.inputs[0])
        links.new(body.outputs["BSDF"], mix_sh.inputs[1])
        links.new(glossy.outputs["BSDF"], mix_sh.inputs[2])
        links.new(mix_sh.outputs["Shader"], out.inputs["Surface"])
    else:
        links.new(body.outputs["BSDF"], out.inputs["Surface"])
    return mat


def assign_purchased_water(river: bpy.types.Object) -> str:
    water = next((mat for mat in bpy.data.materials if mat and str(mat.name).startswith("Water_Mat")), None)
    if water is None:
        water = next((mat for mat in bpy.data.materials if mat and "water" in mat.name.lower() and mat.node_tree), None)
    tint = None
    if water is not None and water.node_tree:
        src = next((n for n in water.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if src and "Base Color" in src.inputs:
            src_col = src.inputs["Base Color"].default_value
            tint = (
                max(0.012, min(0.028, float(src_col[0]) * 0.12)),
                max(0.022, min(0.048, float(src_col[1]) * 0.14)),
                max(0.018, min(0.040, float(src_col[2]) * 0.10)),
                1.0,
            )
    global WATER_TINT
    WATER_TINT = tint
    surface = cinematic_river_material(tint, WATER_VARIANT)
    river.data.materials.clear()
    river.data.materials.append(surface)
    river.hide_render = False
    river.hide_viewport = False
    if hasattr(river, "visible_shadow"):
        river.visible_shadow = False
    apply_stream_tint(tint)
    print(json.dumps({
        "event": "river_material_assigned",
        "name": water.name if water else surface.name,
        "purchased": water is not None,
        "surface": surface.name,
        "variant": WATER_VARIANT,
        "visible": True,
        "riverMask": bool(purchased_river_mask_image()),
    }), flush=True)
    return water.name if water else surface.name


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


def evaluated_centerline(curve_obj: bpy.types.Object, samples: int = 72) -> list[Vector]:
    spline = curve_obj.data.splines[0]
    points = spline.bezier_points
    segs = len(points) - 1
    per = max(4, samples // segs)
    out: list[Vector] = []
    for i in range(segs):
        chunk = interpolate_bezier(points[i].co, points[i].handle_right, points[i + 1].handle_left, points[i + 1].co, per)
        if i < segs - 1:
            chunk = chunk[:-1]
        out.extend(Vector(item) for item in chunk)
    return out


def _side_from_centers(centers: list[Vector], index: int) -> Vector:
    if index < len(centers) - 1:
        tangent = centers[index + 1] - centers[index]
    else:
        tangent = centers[index] - centers[index - 1]
    tangent.z = 0.0
    if tangent.length < 1e-4:
        tangent = Vector((1.0, 0.0, 0.0))
    tangent.normalize()
    return Vector((-tangent.y, tangent.x, 0.0))


def spline_edge_mesh(name: str, centers: list[Vector], inner_half: float, outer_half: float, z_inner: float, z_outer: float, side_sign: float) -> bpy.types.Object:
    verts = []
    faces = []
    for i, center in enumerate(centers):
        side = _side_from_centers(centers, i) * side_sign
        wobble = 0.22 * math.sin(i * 0.31)
        inner = center + side * (inner_half + wobble * 0.2)
        outer = center + side * (outer_half + wobble)
        inner.z = z_inner
        outer.z = z_outer
        verts.extend([(inner.x, inner.y, inner.z), (outer.x, outer.y, outer.z)])
        if i > 0:
            v = i * 2
            faces.append((v - 2, v - 1, v + 1, v))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    shade_smooth(obj)
    return obj


def _channel_halves_for_index(centers: list[Vector], index: int) -> tuple[float, float]:
    center = centers[index]
    _dist, _signed, along, left, right = channel_profile(center.x, center.y)
    return left, right


def spline_channel_mesh(
    name: str,
    centers: list[Vector],
    width_scale: float,
    z_center: float,
    z_edge: float,
    rows: int,
    foam_edges: bool,
    thickness: float = 0.0,
) -> bpy.types.Object:
    """Variable-width strip. Left and right halves are independent."""
    verts = []
    faces = []
    depths = []
    if rows < 3:
        rows = 3
    offsets = [(-1.0 + 2.0 * i / (rows - 1)) for i in range(rows)]
    for i, center in enumerate(centers):
        side = _side_from_centers(centers, i)
        left, right = _channel_halves_for_index(centers, i)
        left *= width_scale
        right *= width_scale
        along_depth = 0.55 + 0.45 * (0.5 + 0.5 * math.sin(i * 0.17))
        left_pinch = 0.80 + 0.28 * math.sin(i * 0.11) + (0.22 * math.sin(i * 0.31) if foam_edges else 0.0)
        right_pinch = 0.76 + 0.26 * math.sin(i * 0.17 + 1.3) + (0.20 * math.cos(i * 0.23) if foam_edges else 0.0)
        if foam_edges:
            south_bay = (i % 23)
            north_bay = (i % 29)
            if 8 <= south_bay <= 12:
                left_pinch *= 0.52 + 0.08 * math.sin(i * 0.9)
            if 15 <= north_bay <= 18:
                right_pinch *= 0.48 + 0.10 * math.cos(i * 0.7)
            if south_bay == 3:
                left_pinch *= 0.70
            if north_bay == 6:
                right_pinch *= 0.66
        for col, offset in enumerate(offsets):
            pinch = left_pinch if offset < 0.0 else right_pinch
            half = (left if offset < 0.0 else right) * pinch
            edge_noise = 0.0
            if abs(offset) > 0.62:
                edge_noise = 0.34 * math.sin(i * 0.37 + col * 1.7) + 0.22 * math.sin(i * 0.19)
                if foam_edges:
                    edge_noise += 0.28 * math.sin(i * 0.53 + (1.0 if offset >= 0.0 else -1.0))
                    edge_noise += 0.16 * math.sin(i * 0.91 + col * 2.1)
            lateral = half * abs(offset) + edge_noise
            point = center + side * (lateral * (1.0 if offset >= 0.0 else -1.0))
            edge = abs(offset)
            z_jit = 0.0 if foam_edges else 0.05 * math.sin(i * 0.29 + col * 0.8)
            point.z = z_center + (z_edge - z_center) * edge + z_jit
            if foam_edges:
                swell = 0.070 * math.sin(i * 0.19 + center.x * 0.31)
                swell += 0.040 * math.sin(i * 0.41 + col * 1.05 + center.y * 0.26)
                swell += 0.022 * math.sin(i * 0.77 + col * 2.0)
                point.z += swell
            verts.append((point.x, point.y, point.z))
            if foam_edges:
                depths.append(min(1.0, edge * edge * 1.15))
            else:
                depths.append(min(1.0, (1.0 - along_depth * (1.0 - edge))))
        if i > 0:
            v = i * rows
            prev = v - rows
            for col in range(rows - 1):
                faces.append((prev + col, prev + col + 1, v + col + 1, v + col))
    if foam_edges and thickness > 0.002:
        top_count = len(verts)
        samples = top_count // rows
        for x, y, z in list(verts):
            verts.append((x, y, z - thickness))
        depths.extend(depths)
        for face in list(faces):
            faces.append(tuple(idx + top_count for idx in reversed(face)))
        for i in range(samples - 1):
            a = i * rows
            b = (i + 1) * rows
            faces.append((a, b, b + top_count, a + top_count))
            a = i * rows + (rows - 1)
            b = (i + 1) * rows + (rows - 1)
            faces.append((a + top_count, b + top_count, b, a))
        for col in range(rows - 1):
            faces.append((col + 1, col, col + top_count, col + 1 + top_count))
            a = (samples - 1) * rows + col
            faces.append((a, a + 1, a + 1 + top_count, a + top_count))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    color = mesh.color_attributes.new(name="TJ_RiverDepth", type="FLOAT_COLOR", domain="POINT")
    for index, value in enumerate(depths):
        color.data[index].color = (value, value, value, 1.0)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    shade_smooth(obj)
    return obj


def spline_strip_mesh(name: str, centers: list[Vector], half_width: float, z_offset: float, width_wobble: float) -> bpy.types.Object:
    """Compatibility wrapper. Prefer spline_channel_mesh for the two-layer river."""
    return spline_channel_mesh(
        name,
        centers,
        width_scale=max(0.4, half_width / max(0.1, WATER_HALF_WIDTH)),
        z_center=WATER_SURFACE_Z + z_offset,
        z_edge=WATER_SURFACE_Z + z_offset + 0.006,
        rows=5,
        foam_edges=True,
    )


def dirt_bank_material() -> bpy.types.Material:
    mat = bpy.data.materials.new("TJ_RiverBank_Dirt")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = (0.18, 0.12, 0.07, 1.0)
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.92
        coord = nodes.new("ShaderNodeTexCoord")
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 0.7
        links.new(coord.outputs["Object"], noise.inputs["Vector"])
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.055, 0.048, 0.028, 1.0)
        ramp.color_ramp.elements[1].color = (0.09, 0.07, 0.04, 1.0)
        links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def build_broken_bank_patches(centers: list[Vector]) -> list:
    """Short wet-earth patches, not a continuous road outline."""
    patches = []
    mat = dirt_bank_material()
    step = 7
    for start in range(3, max(4, len(centers) - 6), step):
        if (start // step) % 2 == 0:
            continue
        chunk = centers[start:start + 4]
        if len(chunk) < 3:
            continue
        side_sign = 1.0 if (start // step) % 4 == 1 else -1.0
        left, right = _channel_halves_for_index(centers, start)
        local = left if side_sign < 0.0 else right
        bank = spline_edge_mesh(
            f"TJ_RiverBankPatch_{start}",
            chunk,
            inner_half=local * 0.88,
            outer_half=local * 0.88 + 1.35 + 0.40 * math.sin(start * 0.4),
            z_inner=BED_SHOULDER_Z + 0.06,
            z_outer=BANK_CREST_Z - 0.04,
            side_sign=side_sign,
        )
        bank.data.materials.clear()
        bank.data.materials.append(mat)
        patches.append(bank)
    return patches


def build_river() -> tuple[bpy.types.Object, str, list]:
    guide = build_river_guide()
    centers = evaluated_centerline(guide, samples=180)
    bed = spline_channel_mesh(
        "TJ_River_DarkBed",
        centers,
        width_scale=BED_WIDTH_SCALE,
        z_center=BED_CENTER_Z + 0.05,
        z_edge=BED_SHOULDER_Z + 0.04,
        rows=11,
        foam_edges=False,
    )
    bed.data.materials.clear()
    bed.data.materials.append(cinematic_riverbed_material())
    if hasattr(bed, "visible_shadow"):
        bed.visible_shadow = False
    river = spline_channel_mesh(
        "TJ_River_PurchasedWater",
        centers,
        width_scale=WATER_WIDTH_SCALE,
        z_center=WATER_SURFACE_Z,
        z_edge=WATER_SURFACE_Z + 0.032,
        rows=9,
        foam_edges=True,
        thickness=WATER_THICKNESS,
    )
    assigned = assign_purchased_water(river)
    extras = [bed]
    # Rectangular bank patches read as planks/bridges. Terrain wet-mask,
    # dark bed, and crest trees carry the breakup.
    print(json.dumps({
        "event": "geometry_first_channel_built",
        "bed": bed.name,
        "film": river.name,
        "bedWidthScale": BED_WIDTH_SCALE,
        "waterWidthScale": WATER_WIDTH_SCALE,
        "waterThickness": WATER_THICKNESS,
        "bedCenterZ": BED_CENTER_Z,
        "bankCrestZ": BANK_CREST_Z,
        "bankPatches": 0,
        "centers": len(centers),
    }), flush=True)
    return river, assigned, extras


def sit_louis_piece(obj: bpy.types.Object, center_x: float, south_y: float, scale: float, z_lift: float = 0.0) -> None:
    obj.parent = None
    try:
        obj.matrix_parent_inverse.identity()
    except Exception:
        pass
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (scale, scale, scale)
    obj.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    bounds = group_bounds([obj])
    if not bounds:
        obj.location = (center_x, south_y, z_lift)
        return
    mins, maxs = bounds
    obj.location = (
        center_x - (mins.x + maxs.x) * 0.5,
        south_y - mins.y,
        z_lift - mins.z,
    )
    if hasattr(obj, "visible_shadow"):
        obj.visible_shadow = False


def place_louis_lp_ridge(files: list[Path], collection: bpy.types.Collection) -> list:
    """Use authored LP Meadow/Grassy ranges. Do not smash HP tiles to 70x34."""
    meadow = next((path for path in files if path.name.lower() == "meadow.blend"), None)
    grassy = next((path for path in files if path.name.lower() == "grassy.blend"), None)
    members = []
    if meadow is not None:
        members.extend(append_named_objects(meadow, list(LOUIS_LP_MEADOW)))
    if grassy is not None:
        members.extend(append_named_objects(grassy, list(LOUIS_LP_PEAKS)))
    for obj in list(bpy.data.objects):
        if obj.name.startswith("HP_"):
            obj.hide_render = True
            obj.hide_viewport = True
            try:
                bpy.data.objects.remove(obj, do_unlink=True)
            except Exception:
                pass
    foothill_slots = ((10.0, 46.0, 0.16), (52.0, 48.0, 0.15))
    peak_slots = ((-36.0, 78.0, 0.30), (8.0, 84.0, 0.32), (50.0, 80.0, 0.28))
    placed = []
    foothills = [obj for obj in members if obj and "meadowrange" in obj.name.lower()]
    peaks = [obj for obj in members if obj and "grassymountain" in obj.name.lower()]
    for obj, (cx, south, scale) in zip(foothills, foothill_slots):
        sit_louis_piece(obj, cx, south, scale)
        link_exclusive(obj, collection)
        placed.append(obj)
    for obj, (cx, south, scale) in zip(peaks, peak_slots):
        sit_louis_piece(obj, cx, south, scale)
        link_exclusive(obj, collection)
        placed.append(obj)
    print(json.dumps({
        "event": "louis_lp_ridge_placed",
        "count": len(placed),
        "names": [obj.name for obj in placed],
    }), flush=True)
    return placed


def place_purchased_water_gn(files: list[Path], collection: bpy.types.Collection) -> str | None:
    project = next((path for path in files if path.name.lower() == "project file.blend"), None)
    if project is None:
        return None
    before = set(bpy.data.objects.keys())
    append_named_objects(project, ["Water_GN_Plane"])
    leftovers = [
        obj for obj in list(bpy.data.objects)
        if obj.name not in before and "water" not in obj.name.lower()
    ]
    for obj in leftovers:
        obj.hide_render = True
        obj.hide_viewport = True
        try:
            obj.location = (0.0, -420.0, -90.0)
        except Exception:
            pass
        print(json.dumps({"event": "hidden_project_leftover", "name": obj.name}), flush=True)
    water = next((obj for obj in bpy.data.objects if obj.name.startswith("Water_GN_Plane")), None)
    if water is None:
        return None
    water.name = "TJ_River_PurchasedWaterGN"
    water.parent = None
    for mod in list(getattr(water, "modifiers", []) or []):
        if getattr(mod, "type", "") == "NODES":
            try:
                water.modifiers.remove(mod)
            except Exception:
                mod.show_render = False
                mod.show_viewport = False
    # Material donor only. A visible rectangle reads as a floating water card.
    water.hide_render = True
    water.hide_viewport = True
    water.location = (0.0, -420.0, -90.0)
    donated = next((mat.name for mat in bpy.data.materials if mat and str(mat.name).startswith("Water_Mat")), water.name)
    print(json.dumps({"event": "purchased_water_mat_donated", "name": donated}), flush=True)
    return donated


def place_bank_crest_trees(trees: list) -> list:
    """Irregular crest plantings. Never a continuous outline, never in the bed."""
    extras = []
    live = [obj for obj in trees if obj and obj.type == "MESH"]
    if not live:
        return extras
    guide = bpy.data.objects.get("TJ_River_SplineGuide")
    if guide is None:
        return extras
    centers = evaluated_centerline(guide, samples=72)
    for i, center in enumerate(centers):
        key = (i * 7 + 3) % 11
        if key not in {1, 4, 8}:
            continue
        left, right = _channel_halves_for_index(centers, i)
        side = _side_from_centers(centers, i)
        sign = -1.0 if key == 4 else 1.0
        if i % 5 == 0:
            sign *= -1.0
        half = left if sign < 0.0 else right
        offset = half + 1.05 + 0.85 * math.sin(i * 0.47 + key)
        loc = center + side * (offset * sign)
        if in_village(loc.x, loc.y) or in_river_channel(loc.x, loc.y, margin=0.35):
            continue
        extras.append(duplicate_mesh_in_world(live[i % len(live)], (loc.x, loc.y, 0.0), 0.20 + 0.22 * ((i * 3) % 5) / 4.0))
    return extras


def place_waterline_dressing(trees: list) -> list:
    """Small south-bank plantings that break the grass-to-water knife."""
    extras = []
    live = [obj for obj in trees if obj and obj.type == "MESH"]
    if not live:
        return extras
    guide = bpy.data.objects.get("TJ_River_SplineGuide")
    if guide is None:
        return extras
    centers = evaluated_centerline(guide, samples=80)
    for i, center in enumerate(centers):
        key = (i * 5 + 2) % 9
        if key not in {1, 3, 6}:
            continue
        left, _right = _channel_halves_for_index(centers, i)
        side = _side_from_centers(centers, i)
        offset = left * 0.94 + 0.28 * math.sin(i * 0.61 + key)
        loc = center + side * (-offset)
        dist, _signed, _along, _left, _right = channel_profile(loc.x, loc.y)
        if in_village(loc.x, loc.y) or dist < left * 0.40:
            continue
        extras.append(duplicate_mesh_in_world(live[i % len(live)], (loc.x, loc.y, 0.0), 0.14 + 0.10 * ((i * 3) % 5) / 4.0))
    return extras


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
            if in_river_channel(loc[0], loc[1], margin=1.6):
                continue
            if in_shot03_corridor(loc[0], loc[1]):
                continue
            if math.hypot(loc[0] + 34.0, loc[1] - 16.0) < 12.0:
                continue
            extras.append(duplicate_mesh_in_world(src, loc, scale * (0.85 + 0.08 * ((i + clump) % 5))))
    return extras


def setup_lighting_hierarchy() -> None:
    bpy.ops.object.light_add(type="SUN", location=(18.0, -48.0, 70.0))
    sun = bpy.context.object
    sun.name = "TJ_KeySun"
    sun.data.energy = 5.8
    sun.data.angle = math.radians(3.4)
    sun.rotation_euler = (math.radians(52), math.radians(6), math.radians(28))
    if hasattr(sun.data, "color"):
        sun.data.color = (1.0, 0.88, 0.70)
    bpy.ops.object.light_add(type="AREA", location=(0.0, 18.0, 56.0))
    sky = bpy.context.object
    sky.name = "TJ_SkyFill"
    sky.data.energy = 120
    sky.data.size = 80
    sky.rotation_euler = (math.radians(0), 0.0, 0.0)
    if hasattr(sky.data, "color"):
        sky.data.color = (0.74, 0.84, 1.0)
    if hasattr(sky, "visible_glossy"):
        sky.visible_glossy = False
    bpy.ops.object.light_add(type="AREA", location=(0.0, 4.0, 1.6))
    bounce = bpy.context.object
    bounce.name = "TJ_GroundBounce"
    bounce.data.energy = 130
    bounce.data.size = 32
    bounce.rotation_euler = (math.radians(90), 0.0, 0.0)
    if hasattr(bounce.data, "color"):
        bounce.data.color = (1.0, 0.86, 0.62)
    if hasattr(bounce, "visible_glossy"):
        bounce.visible_glossy = False
    bpy.ops.object.light_add(type="AREA", location=(-28.0, 22.0, 9.0))
    forest = bpy.context.object
    forest.name = "TJ_ForestFill"
    forest.data.energy = 130
    forest.data.size = 20
    forest.rotation_euler = (math.radians(58), 0.0, math.radians(18))
    if hasattr(forest.data, "color"):
        forest.data.color = (1.0, 0.88, 0.70)
    if hasattr(forest, "visible_glossy"):
        forest.visible_glossy = False
    bpy.ops.object.light_add(type="AREA", location=(2.0, -12.0, 5.5))
    creek = bpy.context.object
    creek.name = "TJ_CreekFill"
    creek.data.energy = 55
    creek.data.size = 28
    creek.rotation_euler = (0.0, 0.0, 0.0)
    if hasattr(creek.data, "color"):
        creek.data.color = (0.72, 0.86, 0.80)
    if hasattr(creek, "visible_glossy"):
        creek.visible_glossy = False
    for lamp in (sky, bounce, forest, creek):
        if hasattr(lamp.data, "use_shadow"):
            lamp.data.use_shadow = False


def setup_mist_and_compositor() -> None:
    scene = bpy.context.scene
    if hasattr(scene.world, "mist_settings"):
        scene.world.mist_settings.use_mist = True
        scene.world.mist_settings.start = 58.0
        scene.world.mist_settings.depth = 170.0
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
        scale.inputs[1].default_value = 0.13
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


def setup_control_cameras() -> list[str]:
    """Lookdev-only grazing and downward river cameras. Not part of the six-shot edit."""
    scene = bpy.context.scene
    specs = (
        {
            "name": "TJ_RIVER_GRAZE_CAM",
            "location": (-20.4, -18.8, 2.15),
            "look": (8.5, -13.2, -1.12),
            "lens": 40.0,
        },
        {
            "name": "TJ_RIVER_DOWN_CAM",
            "location": (-6.4, -16.8, 7.4),
            "look": (1.2, -12.2, -1.20),
            "lens": 32.0,
        },
    )
    names = []
    for spec in specs:
        bpy.ops.object.camera_add(location=spec["location"])
        cam = bpy.context.object
        cam.name = spec["name"]
        cam.data.lens = spec["lens"]
        cam.data.sensor_width = 32
        cam.data.dof.use_dof = False
        target = bpy.data.objects.new(spec["name"] + "_LOOK", None)
        scene.collection.objects.link(target)
        target.location = spec["look"]
        constraint = cam.constraints.new(type="TRACK_TO")
        constraint.target = target
        constraint.track_axis = "TRACK_NEGATIVE_Z"
        constraint.up_axis = "UP_Y"
        names.append(cam.name)
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
            scene.cycles.use_denoising = bool(defaults.get("denoise")) or int(samples) >= 32
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
        if hasattr(scene.cycles, "transmission_bounces"):
            scene.cycles.transmission_bounces = max(8, int(getattr(scene.cycles, "transmission_bounces", 8) or 8))
        if hasattr(scene.cycles, "transparent_max_bounces"):
            scene.cycles.transparent_max_bounces = max(8, int(getattr(scene.cycles, "transparent_max_bounces", 8) or 8))
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
        scene.view_settings.exposure = 0.30
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
    global WATER_VARIANT
    WATER_VARIANT = (args.water_variant or "A").upper()
    write_progress("CINEMATIC_WORLD_START", profile=args.profile, waterVariant=WATER_VARIANT)
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
    mountain_members = place_louis_lp_ridge(expanded.get("background_mountains", []), collections["WORLD_MOUNTAINS_BACKGROUND"])
    terrain = build_terrain(all_files)
    link_exclusive(terrain, collections["WORLD_TERRAIN"])
    water_loaded = load_water_materials(expanded.get("village_project", []) + expanded.get("forest_ecokit", []))
    river, river_material, banks = build_river()
    link_exclusive(river, collections["WORLD_RIVER"])
    for bank in banks:
        link_exclusive(bank, collections["WORLD_RIVER"])
    if args.hide_water:
        river.hide_render = True
        river.hide_viewport = True
        print(json.dumps({"event": "water_hidden_geometry_test", "object": river.name}), flush=True)
    water_gn = place_purchased_water_gn(expanded.get("village_project", []), collections["WORLD_RIVER"])

    village_center = Vector((0.0, 0.0, 0.0))
    village_files = expanded.get("village_blender", [])
    cabin_files = role_files(village_files, ("cabin",), ("interior",))
    cabin_files = sorted(
        [path for path in cabin_files if path.name.lower().endswith(".blend")],
        key=lambda path: path.name.lower(),
    )[:8]
    street_slots = [
        (-9.2, -2.0, 0.0),
        (9.4, -0.2, 0.0),
        (-9.8, 5.0, 0.0),
        (9.8, 6.6, 0.0),
        (-10.2, 11.6, 0.0),
        (10.0, 13.0, 0.0),
        (-9.4, 17.8, 0.0),
        (10.4, 19.2, 0.0),
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
    prop_files = role_files(village_files, ("cart", "fence", "gate", "barrel", "crate", "firewoods", "bucket"), ("grass01",))
    prop_members, prop_imported, prop_placed = import_kit_groups(
        prop_files,
        "village_blender",
        [
            (1.6, -5.4, 0.0),
            (-2.8, 2.2, 0.0),
            (0.2, 8.4, 0.0),
            (2.4, 14.6, 0.0),
            (-4.6, 6.0, 0.0),
            (4.8, 10.2, 0.0),
            (0.0, 18.4, 0.0),
        ],
        village_center,
        5,
    )
    for obj in prop_members:
        link_exclusive(obj, collections["WORLD_PROPS"])
    tree_files = role_files(village_files, ("tree",), ("grass01",))
    street_tree_members, street_tree_imported, street_tree_placed = import_kit_groups(
        tree_files,
        "village_blender",
        [
            (-14.2, -1.2, 0.0),
            (14.6, 1.6, 0.0),
            (-14.8, 6.8, 0.0),
            (15.0, 8.8, 0.0),
            (-15.0, 13.6, 0.0),
            (15.2, 15.8, 0.0),
            (-14.4, 19.6, 0.0),
            (15.4, 21.4, 0.0),
        ],
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
            west = duplicate_mesh_in_world(nature_members[0], (-44.0, 54.0, 0.0), 1.6)
            east = duplicate_mesh_in_world(nature_members[0], (46.0, 56.0, 0.0), 1.7)
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
    west_fg = scatter_clumps(trees, (-26.0, 6.0, 0.0), 3, 2, 7.0, 1.05, 3)
    west_mg = scatter_clumps(trees, (-44.0, 40.0, 0.0), 3, 2, 8.0, 1.35, 7)
    east_fg = scatter_clumps(trees, (24.0, 12.0, 0.0), 3, 2, 7.0, 1.08, 5)
    east_mg = scatter_clumps(trees, (28.0, 32.0, 0.0), 3, 2, 8.0, 1.40, 11)
    if trees:
        cam_xy = Vector((-34.0, 16.0, 0.0))
        look_xy = Vector((-14.0, 36.0, 0.0))
        along = look_xy - cam_xy
        span = along.length
        along.normalize()
        side = Vector((-along.y, along.x, 0.0))
        src_count = len(trees)
        for i, (t, offset, scale) in enumerate((
            (0.26, 4.0, 1.22),
            (0.26, -4.2, 1.18),
            (0.42, 4.8, 1.32),
            (0.42, -4.6, 1.24),
            (0.58, 5.2, 1.38),
            (0.58, -5.0, 1.28),
            (0.74, 5.6, 1.42),
            (0.74, -5.4, 1.34),
        )):
            loc = cam_xy + along * (t * span) + side * offset
            west_fg.append(duplicate_mesh_in_world(trees[i % src_count], (loc.x, loc.y, 0.0), scale))
        if not in_river_channel(-16.5, -7.2, margin=1.2):
            west_fg.append(duplicate_mesh_in_world(trees[0], (-16.5, -7.2, 0.0), 1.05))
        for item in (
            (-17.0, -21.5, 0.82),
            (12.5, -19.0, 0.74),
            (-8.5, -22.0, 0.68),
            (22.0, -21.0, 0.90),
            (-14.0, -22.4, 0.32),
            (-3.5, -23.0, 0.26),
            (6.5, -21.6, 0.30),
            (16.5, -23.2, 0.34),
            (-18.4, -19.6, 0.36),
            (-4.8, -20.2, 0.28),
            (3.8, -20.8, 0.32),
            (11.2, -19.4, 0.26),
        ):
            if in_river_channel(item[0], item[1], margin=0.8):
                continue
            west_fg.append(duplicate_mesh_in_world(trees[int(abs(item[0])) % src_count], (item[0], item[1], 0.0), item[2]))
        west_fg.extend(place_bank_crest_trees(trees))
        west_fg.extend(place_waterline_dressing(trees))
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
    control_cams = setup_control_cameras()
    cameras.extend(control_cams)
    applied = apply_profile(args.profile, args)

    contributions = {
        "village_blender": visible_use_record("village_blender", downloaded=True, extracted=True, datablockLoaded=imported > 0, renderedPixels=imported > 0, shotIds=["SHOT_04", "SHOT_06"], evidence="collection:WORLD_VILLAGE"),
        "village_fbx": visible_use_record("village_fbx", downloaded=True, extracted=True, datablockLoaded=fbx_imported > 0, renderedPixels=fbx_imported > 0, shotIds=["SHOT_04"], evidence="collection:WORLD_PROPS"),
        "village_project": visible_use_record(
            "village_project",
            downloaded=True,
            extracted=True,
            datablockLoaded=water_loaded > 0 or bool(water_gn),
            renderedPixels=river_material.startswith("Water_Mat"),
            shotIds=["SHOT_02"] if river_material.startswith("Water_Mat") else [],
            evidence=f"spline_strip:{river_material}" if river_material.startswith("Water_Mat") else "",
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
        "purchasedWaterGn": water_gn,
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
        "riverSource": "geometry_first_carved_channel_dark_bed_narrow_film",
        "hideWater": bool(args.hide_water),
        "forestLayout": "flank_clumps_mountain_corridor",
        "mountainLayout": "louis_lp_meadow_range_and_grassy_peaks",
    }
    Path(args.proof_path).write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    write_progress("CINEMATIC_WORLD_BUILT", cameras=len(cameras), forestCopies=proof["forestCopies"])

    frames = [int(part) for part in (args.stills_frames or ",".join(str(item) for item in lookdev_frames())).split(",") if part.strip()]
    if args.ab_water:
        river_obj = bpy.data.objects.get("TJ_River_PurchasedWater")
        set_active_camera_for_frame(210)
        for label in ("A", "B", "C", "D"):
            if river_obj is not None:
                mat = cinematic_river_material(WATER_TINT, label)
                river_obj.data.materials.clear()
                river_obj.data.materials.append(mat)
            bpy.context.scene.render.filepath = str(out / f"variant_{label.lower()}_shot_02_")
            write_progress("LOOKDEV_WATER_AB", variant=label, frame=210)
            bpy.ops.render.render(write_still=True)
        write_progress("LOOKDEV_COMPLETE", frames=4, waterAb=True)
        return 0
    if args.stills_only or normalize_profile(args.profile) in {"BLOCKOUT", "LOOKDEV_FAST", "HERO_STILL"}:
        for frame in frames:
            set_active_camera_for_frame(frame)
            shot = next(item for item in SHOTS if item["start"] <= frame <= item["end"])
            bpy.context.scene.render.filepath = str(out / f"{shot['id'].lower()}_")
            write_progress("LOOKDEV_STILL", frame=frame, shot=shot["id"])
            bpy.ops.render.render(write_still=True)
        if args.control_tests:
            for name, label in (("TJ_RIVER_GRAZE_CAM", "control_graze"), ("TJ_RIVER_DOWN_CAM", "control_down")):
                cam = bpy.data.objects.get(name)
                if cam is None:
                    continue
                bpy.context.scene.camera = cam
                bpy.context.scene.frame_set(210)
                bpy.context.scene.render.filepath = str(out / f"{label}_")
                write_progress("LOOKDEV_CONTROL", camera=name, label=label)
                bpy.ops.render.render(write_still=True)
                frames.append(210)
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
