#!/usr/bin/env python3
"""Build proposed Pip and Goat theatrical production-rebuild sculpts.

Stages 1-3 only. Separate-object lookdev sculpts. No retopo, groom, rig,
canon replace, or THEATRICAL binding.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/build_theatrical_production_rebuild.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from theatrical_rebuild_common import (  # noqa: E402
    ARTIFACTS,
    GOAT_BROW,
    GOAT_CINNAMON,
    GOAT_COPPER,
    GOAT_EAR_IN,
    GOAT_HOOF,
    GOAT_HORN,
    GOAT_IRIS,
    GOAT_MOUTH,
    GOAT_NOSE,
    GOAT_OAT_DEEP,
    GOAT_OATMEAL,
    GOAT_SCALE,
    GOAT_SCARF,
    GOAT_TEAL,
    GOAT_TONGUE,
    PIP_BEAK,
    PIP_BEAK_IN,
    PIP_BROW,
    PIP_CHARTREUSE,
    PIP_CLAW,
    PIP_COPPER,
    PIP_CREAM,
    PIP_CREST,
    PIP_FEET,
    PIP_IRIS,
    PIP_LASH,
    PIP_OLIVE,
    PIP_TAIL,
    PIP_TARGET_HEIGHT,
    PIP_TEAL,
    PIP_TEAL_DEEP,
    PIP_TONGUE,
    PROPOSED_REBUILD,
    apply_and_parent,
    assert_not_production_library,
    cloth_mat,
    eye_catch_mat,
    eye_iris_mat,
    eye_pupil_mat,
    eye_white_mat,
    fuzz_mat,
    leather_mat,
    make_bar,
    make_cone,
    make_cube,
    make_cylinder,
    make_root,
    make_sphere,
    make_spiral,
    make_torus,
    mesh_centroid,
    mesh_objects,
    metal_mat,
    principled_mat,
    reset_scene,
    scale_root_to_height,
    snap_root_to_ground,
    tagged,
    world_bounds_objects,
)

FACING = Vector((1.0, 0.0, 0.0))
CHAR_LEFT = Vector((0.0, 1.0, 0.0))


def _eevee():
    scene = bpy.context.scene
    try:
        available = {item.identifier for item in scene.render.bl_rna.properties["engine"].enum_items}
    except Exception:
        available = set()
    return "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in available else "BLENDER_EEVEE"


def apply_khronos():
    scene = bpy.context.scene
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.display_settings.display_device = "sRGB"


def setup_review_lighting():
    apply_khronos()
    scene = bpy.context.scene
    world = bpy.data.worlds.new("RebuildWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.83, 0.86, 0.89, 1.0)
    bg.inputs["Strength"].default_value = 0.88
    key = bpy.data.lights.new("Key", "SUN")
    key.energy = 2.35
    key_obj = bpy.data.objects.new("Key", key)
    scene.collection.objects.link(key_obj)
    key_obj.rotation_euler = (0.70, 0.10, 0.32)
    fill = bpy.data.lights.new("Fill", "SUN")
    fill.energy = 0.62
    fill_obj = bpy.data.objects.new("Fill", fill)
    scene.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (0.95, -0.42, 3.25)
    rim = bpy.data.lights.new("Rim", "SUN")
    rim.energy = 0.28
    rim_obj = bpy.data.objects.new("Rim", rim)
    scene.collection.objects.link(rim_obj)
    rim_obj.rotation_euler = (1.15, 0.55, 2.40)


def add_ground():
    bpy.ops.mesh.primitive_plane_add(size=14.0, location=(0.0, 0.0, -0.002))
    ground = bpy.context.object
    ground.name = "ReviewGround"
    mat = principled_mat("ReviewGround", (0.78, 0.80, 0.82), roughness=0.86, specular=0.08)
    ground.data.materials.append(mat)
    return ground


def add_camera(name, location, target, ortho):
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = ortho
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()
    return obj


def render_path(path: Path, samples: int = 24):
    scene = bpy.context.scene
    scene.render.engine = _eevee()
    scene.render.resolution_x = 1080
    scene.render.resolution_y = 1920
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.filepath = str(path)
    scene.render.film_transparent = False
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = samples
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "use_shadows"):
        scene.eevee.use_shadows = True
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)


def save_blend(path: Path):
    assert_not_production_library(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path), compress=True)


def _pip_mats():
    body = fuzz_mat("PipBody", PIP_CHARTREUSE, roughness=0.48, subsurface=0.16, sheen=0.40)
    cream = fuzz_mat("PipCream", PIP_CREAM, roughness=0.46, subsurface=0.18, sheen=0.36)
    olive = fuzz_mat("PipOlive", PIP_OLIVE, roughness=0.52, subsurface=0.12, sheen=0.34)
    crest = fuzz_mat("PipCrest", PIP_CREST, roughness=0.40, subsurface=0.12, sheen=0.28)
    beak = principled_mat("PipBeak", PIP_BEAK, roughness=0.34, subsurface=0.08, coat=0.06, coat_rough=0.22)
    beak_in = principled_mat("PipBeakIn", PIP_BEAK_IN, roughness=0.46, subsurface=0.10)
    feet = principled_mat("PipFeet", PIP_FEET, roughness=0.40, subsurface=0.06, coat=0.04, coat_rough=0.30)
    claw = principled_mat("PipClaw", PIP_CLAW, roughness=0.36, coat=0.05)
    scarf = cloth_mat("PipScarf", PIP_TEAL)
    satchel = leather_mat("PipSatchel", PIP_TEAL_DEEP, roughness=0.52)
    copper = metal_mat("PipCopper", PIP_COPPER, roughness=0.36)
    tail = fuzz_mat("PipTail", PIP_TAIL, roughness=0.44, subsurface=0.10, sheen=0.30)
    return {
        "body": body,
        "cream": cream,
        "olive": olive,
        "crest": crest,
        "beak": beak,
        "beak_in": beak_in,
        "feet": feet,
        "claw": claw,
        "scarf": scarf,
        "satchel": satchel,
        "copper": copper,
        "tail": tail,
        "white": eye_white_mat("PipEyeWhite"),
        "iris": eye_iris_mat("PipIris", PIP_IRIS),
        "pupil": eye_pupil_mat("PipPupil"),
        "catch": eye_catch_mat("PipCatch"),
        "brow": principled_mat("PipBrow", PIP_BROW, roughness=0.58),
        "lash": principled_mat("PipLash", PIP_LASH, roughness=0.42),
        "tongue": principled_mat("PipTongue", PIP_TONGUE, roughness=0.36, subsurface=0.18),
        "mouth": principled_mat("PipMouth", (0.32, 0.08, 0.10), roughness=0.48),
    }


def build_pip():
    reset_scene()
    m = _pip_mats()
    root = make_root("Pip_Root")

    make_sphere("Pip_Body", 0.36, (0.02, 0.00, 0.78), segs=40, rings=24, material=m["body"], scale=(0.82, 0.88, 1.22))
    make_sphere("Pip_Belly", 0.24, (0.18, 0.00, 0.64), segs=24, rings=16, material=m["cream"], scale=(0.72, 0.92, 1.12))
    make_sphere("Pip_BackDepth", 0.20, (-0.16, 0.00, 0.86), segs=20, rings=14, material=m["olive"], scale=(0.55, 0.88, 1.05))
    make_sphere("Pip_Head", 0.38, (0.06, 0.00, 1.50), segs=40, rings=24, material=m["body"], scale=(0.98, 1.00, 0.96))
    make_sphere("Pip_Face", 0.28, (0.26, 0.00, 1.46), segs=26, rings=18, material=m["cream"], scale=(0.58, 1.02, 0.92))
    make_sphere("Pip_Cheek_L", 0.12, (0.24, 0.18, 1.38), segs=18, rings=12, material=m["cream"], scale=(0.80, 1.05, 0.88))
    make_sphere("Pip_Cheek_R", 0.12, (0.24, -0.18, 1.38), segs=18, rings=12, material=m["cream"], scale=(0.80, 1.05, 0.88))
    make_sphere("Pip_Neck", 0.13, (0.04, 0.00, 1.18), segs=20, rings=14, material=m["body"], scale=(1.08, 0.95, 0.70))

    # Exactly three coral crest feathers: center tallest, balanced fan, swept back.
    crest_c = make_sphere("Pip_Crest_C", 0.070, (-0.04, 0.00, 1.98), segs=20, rings=14, material=m["crest"], scale=(0.40, 0.34, 2.05))
    crest_c.rotation_euler = (0.0, math.radians(-36), 0.0)
    crest_l = make_sphere("Pip_Crest_L", 0.058, (-0.01, 0.078, 1.88), segs=18, rings=12, material=m["crest"], scale=(0.38, 0.32, 1.58))
    crest_l.rotation_euler = (math.radians(-12), math.radians(-28), math.radians(20))
    crest_r = make_sphere("Pip_Crest_R", 0.058, (-0.01, -0.078, 1.88), segs=18, rings=12, material=m["crest"], scale=(0.38, 0.32, 1.58))
    crest_r.rotation_euler = (math.radians(12), math.radians(-28), math.radians(-20))

    for side, y in (("L", 0.135), ("R", -0.135)):
        make_sphere(f"Pip_EyeWhite_{side}", 0.125, (0.36, y, 1.54), segs=24, rings=16, material=m["white"], scale=(0.58, 1.06, 1.08))
        make_sphere(f"Pip_Iris_{side}", 0.068, (0.415, y, 1.54), segs=20, rings=14, material=m["iris"])
        make_sphere(f"Pip_Pupil_{side}", 0.030, (0.450, y, 1.54), segs=14, rings=10, material=m["pupil"])
        make_sphere(f"Pip_Catch_{side}", 0.015, (0.465, y - 0.024, 1.568), segs=10, rings=6, material=m["catch"])
        make_sphere(f"Pip_Lid_{side}", 0.128, (0.35, y, 1.63), segs=18, rings=12, material=m["body"], scale=(0.55, 1.04, 0.32))
        make_cylinder(
            f"Pip_Brow_{side}",
            0.009,
            0.078,
            (0.30, y, 1.70),
            verts=10,
            material=m["brow"],
            rot=(0.0, math.radians(90), math.radians(-16 if side == "L" else 16)),
        )
        for i, (oy, oz) in enumerate(((-0.040, 0.010), (-0.014, 0.020), (0.014, 0.020), (0.038, 0.008))):
            lash = make_cone(
                f"Pip_Lash_{side}_{i}",
                0.007,
                0.038,
                (0.40, y + oy, 1.665 + oz),
                verts=6,
                material=m["lash"],
                rot=(math.radians(-18), math.radians(70), 0.0),
            )
            lash.scale = (0.55, 0.40, 1.0)

    make_sphere("Pip_BeakUpper", 0.068, (0.46, 0.00, 1.39), segs=20, rings=14, material=m["beak"], scale=(1.35, 0.72, 0.50))
    make_sphere("Pip_BeakLower", 0.052, (0.44, 0.00, 1.318), segs=18, rings=12, material=m["beak"], scale=(1.18, 0.70, 0.38))
    make_sphere("Pip_MouthCavity", 0.034, (0.40, 0.00, 1.345), segs=12, rings=8, material=m["mouth"], scale=(0.70, 0.88, 0.48))
    make_sphere("Pip_Tongue", 0.018, (0.42, 0.00, 1.335), segs=10, rings=6, material=m["tongue"], scale=(1.15, 0.70, 0.38))

    # Layered leaf wings that taper down toward the upper thigh. Not a skirt.
    for side, sy in (("L", 1.0), ("R", -1.0)):
        shoulder = (0.08, sy * 0.36, 1.08)
        rows = (
            (0.00, 0.02, 0.18, 10, 0.070, m["body"]),
            (-0.10, 0.04, 0.22, 13, 0.078, m["body"]),
            (-0.22, 0.05, 0.26, 15, 0.082, m["body"]),
            (-0.34, 0.04, 0.22, 12, 0.072, m["olive"]),
            (-0.44, 0.02, 0.16, 8, 0.058, m["olive"]),
        )
        for i, (dz, dy, length, yaw, width, mat) in enumerate(rows):
            loc = (shoulder[0] + 0.02, shoulder[1] + sy * dy, shoulder[2] + dz)
            feather = make_sphere(
                f"Pip_Wing_{side}_{i}",
                length * 0.5,
                loc,
                segs=18,
                rings=12,
                material=mat,
                scale=(0.32, width / max(length, 1e-4), 1.0),
            )
            feather.rotation_euler = (math.radians(112), math.radians(sy * 4), math.radians(sy * yaw))
        cover = make_sphere(
            f"Pip_WingCover_{side}",
            0.10,
            (shoulder[0], shoulder[1], shoulder[2] + 0.02),
            segs=18,
            rings=12,
            material=m["body"],
            scale=(0.58, 0.88, 0.72),
        )
        cover.rotation_euler = (math.radians(18), 0.0, math.radians(sy * 12))

    for i, (y, z, s) in enumerate(((0.00, 0.48, 1.15), (0.05, 0.44, 0.95), (-0.05, 0.44, 0.95), (0.08, 0.40, 0.80), (-0.08, 0.40, 0.80))):
        tail = make_sphere(f"Pip_Tail_{i}", 0.055, (-0.22, y, z), segs=14, rings=10, material=m["tail"], scale=(0.35, 0.55, s))
        tail.rotation_euler = (0.0, math.radians(55), 0.0)

    make_torus("Pip_Scarf", 0.155, 0.030, (0.04, 0.00, 1.20), material=m["scarf"], rot=(math.radians(8), math.radians(-10), 0.0))
    make_sphere("Pip_ScarfKnot", 0.042, (0.18, 0.00, 1.14), segs=12, rings=8, material=m["scarf"], scale=(0.85, 1.05, 0.70))
    make_sphere("Pip_ScarfTail_A", 0.034, (0.20, 0.04, 1.04), segs=12, rings=8, material=m["scarf"], scale=(0.45, 0.70, 1.35))
    make_sphere("Pip_ScarfTail_B", 0.030, (0.18, -0.05, 1.03), segs=12, rings=8, material=m["scarf"], scale=(0.42, 0.65, 1.20))

    # Satchel: strap over character-right shoulder (-Y), bag on character-left hip (+Y).
    make_cube("Pip_SatchelBag", (0.16, 0.24, 0.58), (0.14, 0.08, 0.16), material=m["satchel"], rot=(0.0, math.radians(-8), math.radians(12)))
    make_cube("Pip_SatchelFlap", (0.18, 0.25, 0.66), (0.145, 0.085, 0.06), material=m["satchel"], rot=(0.0, math.radians(-4), math.radians(12)))
    make_spiral("Pip_SatchelSpiral", (0.26, 0.25, 0.62), 0.048, m["copper"])
    make_bar("Pip_StrapFront", (0.12, -0.22, 1.24), (0.18, 0.24, 0.70), 0.022, m["satchel"])
    make_bar("Pip_StrapBack", (-0.10, -0.20, 1.22), (-0.02, 0.22, 0.68), 0.020, m["satchel"])
    make_torus("Pip_StrapBuckle_0", 0.018, 0.004, (0.02, -0.12, 1.08), material=m["copper"], major_seg=16, minor_seg=8)
    make_torus("Pip_StrapBuckle_1", 0.018, 0.004, (-0.02, 0.00, 0.92), material=m["copper"], major_seg=16, minor_seg=8)
    make_torus("Pip_StrapBuckle_2", 0.018, 0.004, (0.06, 0.12, 0.78), material=m["copper"], major_seg=16, minor_seg=8)

    for side, y in (("L", 0.10), ("R", -0.10)):
        make_sphere(f"Pip_Thigh_{side}", 0.055, (0.04, y, 0.42), segs=14, rings=10, material=m["feet"])
        make_cylinder(f"Pip_Leg_{side}", 0.030, 0.34, (0.05, y, 0.22), verts=14, material=m["feet"])
        make_sphere(f"Pip_Ankle_{side}", 0.032, (0.06, y, 0.07), segs=12, rings=8, material=m["feet"])
        make_sphere(f"Pip_Foot_{side}", 0.050, (0.10, y, 0.038), segs=14, rings=10, material=m["feet"], scale=(1.30, 0.88, 0.50))
        for i, (fx, fy) in enumerate(((0.055, 0.028), (0.072, 0.000), (0.055, -0.028))):
            make_sphere(f"Pip_Toe_{side}_{i}", 0.018, (0.14 + fx, y + fy, 0.026), segs=10, rings=6, material=m["feet"], scale=(1.35, 0.70, 0.55))
            make_sphere(f"Pip_Claw_{side}_{i}", 0.008, (0.195 + fx, y + fy, 0.022), segs=8, rings=6, material=m["claw"], scale=(1.10, 0.55, 0.45))
        make_sphere(f"Pip_Hallux_{side}", 0.016, (0.00, y, 0.022), segs=10, rings=6, material=m["feet"], scale=(1.20, 0.70, 0.50))
        make_sphere(f"Pip_HalluxClaw_{side}", 0.007, (-0.035, y, 0.018), segs=8, rings=6, material=m["claw"], scale=(1.05, 0.50, 0.40))

    apply_and_parent("Pip_", root, uv_names=())
    snap_root_to_ground(root, "Pip_")
    scale_root_to_height(root, "Pip_", PIP_TARGET_HEIGHT)
    tagged(
        root,
        ddp_character_code="CHAR_PIP_001",
        ddp_asset_id="char_pip_theatrical_production_rebuild_proposed",
        ddp_approved=False,
        ddp_quality="PROPOSED_PRODUCTION_REBUILD",
        ddp_theatrical_bound=False,
        ddp_stage="3_visual_gate",
    )
    mn, mx = world_bounds_objects(mesh_objects("Pip_"))
    bag_y = float(mesh_centroid(bpy.data.objects["Pip_SatchelBag"]).y)
    return {
        "root": root.name,
        "height": mx.z - mn.z,
        "min": list(mn),
        "max": list(mx),
        "objects": sorted(obj.name for obj in mesh_objects("Pip_")),
        "satchel_bag_y": bag_y,
        "satchel_bag_character_left": bag_y > 0,
    }


def _goat_mats():
    body = fuzz_mat("GoatBody", GOAT_OATMEAL, roughness=0.50, subsurface=0.20, sheen=0.46)
    deep = fuzz_mat("GoatOatDeep", GOAT_OAT_DEEP, roughness=0.52, subsurface=0.16, sheen=0.40)
    cin = fuzz_mat("GoatCinnamon", GOAT_CINNAMON, roughness=0.50, subsurface=0.14, sheen=0.36)
    scarf = cloth_mat("GoatScarf", GOAT_SCARF, roughness=0.60, sheen=0.50)
    return {
        "body": body,
        "deep": deep,
        "cin": cin,
        "scarf": scarf,
        "horn": principled_mat("GoatHorn", GOAT_HORN, roughness=0.42, coat=0.08, coat_rough=0.34, specular=0.28),
        "nose": principled_mat("GoatNose", GOAT_NOSE, roughness=0.32, subsurface=0.14, coat=0.06, coat_rough=0.20),
        "ear": principled_mat("GoatEarInner", GOAT_EAR_IN, roughness=0.42, subsurface=0.14, sheen=0.16),
        "hoof": principled_mat("GoatHoof", GOAT_HOOF, roughness=0.40, coat=0.05, coat_rough=0.32),
        "teal": leather_mat("GoatCompassTeal", GOAT_TEAL, roughness=0.38),
        "copper": metal_mat("GoatCopper", GOAT_COPPER, roughness=0.32),
        "face": principled_mat("GoatCompassFace", (0.92, 0.90, 0.84), roughness=0.18, coat=0.16, coat_rough=0.10),
        "needle_n": principled_mat("GoatNeedleN", (0.72, 0.16, 0.14), roughness=0.28, metallic=0.15),
        "needle_s": principled_mat("GoatNeedleS", (0.16, 0.22, 0.42), roughness=0.28, metallic=0.15),
        "white": eye_white_mat("GoatEyeWhite"),
        "iris": eye_iris_mat("GoatIris", GOAT_IRIS),
        "pupil": eye_pupil_mat("GoatPupil"),
        "catch": eye_catch_mat("GoatCatch"),
        "brow": principled_mat("GoatBrow", GOAT_BROW, roughness=0.58),
        "lash": principled_mat("GoatLash", (0.08, 0.05, 0.04), roughness=0.42),
        "tongue": principled_mat("GoatTongue", GOAT_TONGUE, roughness=0.36, subsurface=0.18),
        "mouth": principled_mat("GoatMouth", GOAT_MOUTH, roughness=0.48),
    }


def _cloven(prefix, loc, material, size, forward=0.012):
    make_sphere(f"{prefix}_A", size, (loc[0] + forward, loc[1] - size * 0.38, loc[2]), segs=12, rings=8, material=material, scale=(1.20, 0.52, 0.55))
    make_sphere(f"{prefix}_B", size, (loc[0] + forward, loc[1] + size * 0.38, loc[2]), segs=12, rings=8, material=material, scale=(1.20, 0.52, 0.55))


def build_goat(pip_height: float):
    reset_scene()
    m = _goat_mats()
    root = make_root("Goat_Root")

    make_sphere("Goat_Body", 0.46, (0.00, 0.00, 1.20), segs=40, rings=24, material=m["body"], scale=(0.86, 0.92, 1.10))
    make_sphere("Goat_Belly", 0.26, (0.18, 0.00, 1.04), segs=22, rings=16, material=m["body"], scale=(0.68, 0.90, 1.00))
    make_sphere("Goat_ChestTuft", 0.16, (0.26, 0.00, 1.36), segs=18, rings=12, material=m["body"], scale=(0.70, 0.95, 0.85))
    make_sphere("Goat_Head", 0.44, (0.10, 0.00, 2.22), segs=40, rings=24, material=m["body"], scale=(1.00, 1.00, 0.96))
    make_sphere("Goat_Muzzle", 0.20, (0.48, 0.00, 2.00), segs=22, rings=16, material=m["body"], scale=(1.08, 0.90, 0.78))
    make_sphere("Goat_Cheek_L", 0.13, (0.30, 0.24, 2.10), segs=16, rings=12, material=m["body"])
    make_sphere("Goat_Cheek_R", 0.13, (0.30, -0.24, 2.10), segs=16, rings=12, material=m["body"])
    make_sphere("Goat_Neck", 0.16, (0.06, 0.00, 1.74), segs=20, rings=14, material=m["body"], scale=(1.00, 0.90, 0.88))
    make_sphere("Goat_ForeTuft", 0.11, (0.04, 0.00, 2.64), segs=16, rings=12, material=m["body"], scale=(0.70, 0.85, 0.95))

    # Left-eye cinnamon patch is character-left (+Y) = viewer-right in front.
    make_sphere("Goat_EyePatch_L", 0.18, (0.42, 0.22, 2.30), segs=20, rings=14, material=m["cin"], scale=(0.52, 0.92, 0.95))
    make_sphere("Goat_ShoulderPatch_L", 0.15, (0.02, 0.40, 1.52), segs=16, rings=12, material=m["cin"], scale=(0.65, 1.00, 0.72))
    make_sphere("Goat_ShoulderPatch_R", 0.15, (0.02, -0.40, 1.52), segs=16, rings=12, material=m["cin"], scale=(0.65, 1.00, 0.72))
    back = make_sphere("Goat_BackPatch", 0.22, (-0.38, 0.00, 1.78), segs=22, rings=16, material=m["cin"], scale=(0.30, 0.72, 1.38))
    back.rotation_euler = (0.0, math.radians(18), 0.0)
    make_sphere("Goat_TailPatch", 0.08, (-0.40, 0.00, 0.96), segs=12, rings=8, material=m["cin"], scale=(0.42, 0.65, 0.75))

    for side, y, yaw in (("L", 0.16, -18), ("R", -0.16, 18)):
        horn = make_cone(
            f"Goat_Horn_{side}",
            0.060,
            0.32,
            (-0.04, y, 2.74),
            verts=16,
            material=m["horn"],
            rot=(math.radians(16), math.radians(-24), math.radians(yaw)),
        )
        horn.scale = (0.85, 0.85, 1.0)
        for i, t in enumerate((0.22, 0.42, 0.62, 0.80)):
            loc = (-0.04 - 0.07 * t, y + (0.03 if side == "L" else -0.03) * t, 2.60 + 0.30 * t)
            make_torus(
                f"Goat_HornRidge_{side}_{i}",
                0.046 - 0.006 * i,
                0.009,
                loc,
                material=m["horn"],
                rot=(math.radians(16), math.radians(-24), math.radians(yaw)),
                major_seg=16,
                minor_seg=8,
            )

    for side, y in (("L", 0.52), ("R", -0.52)):
        ear = make_sphere(f"Goat_Ear_{side}", 0.18, (0.06, y, 2.00), segs=20, rings=14, material=m["body"], scale=(0.36, 0.48, 1.55))
        ear.rotation_euler = (math.radians(12), math.radians(8 if side == "R" else -8), math.radians(8 if side == "L" else -8))
        inn = make_sphere(f"Goat_EarInner_{side}", 0.12, (0.10, y * 0.90, 1.98), segs=16, rings=12, material=m["ear"], scale=(0.28, 0.40, 1.25))
        inn.rotation_euler = ear.rotation_euler

    for side, y in (("L", 0.16), ("R", -0.16)):
        make_sphere(f"Goat_EyeWhite_{side}", 0.145, (0.50, y, 2.30), segs=24, rings=16, material=m["white"], scale=(0.55, 1.05, 1.08))
        make_sphere(f"Goat_Iris_{side}", 0.078, (0.565, y, 2.30), segs=20, rings=14, material=m["iris"])
        make_sphere(f"Goat_Pupil_{side}", 0.032, (0.605, y, 2.30), segs=14, rings=10, material=m["pupil"])
        make_sphere(f"Goat_Catch_{side}", 0.016, (0.620, y - 0.026, 2.328), segs=10, rings=6, material=m["catch"])
        make_sphere(
            f"Goat_Lid_{side}",
            0.148,
            (0.48, y, 2.40),
            segs=18,
            rings=12,
            material=m["cin"] if side == "L" else m["body"],
            scale=(0.52, 1.04, 0.30),
        )
        make_cylinder(
            f"Goat_Brow_{side}",
            0.010,
            0.088,
            (0.42, y, 2.46),
            verts=10,
            material=m["brow"],
            rot=(0.0, math.radians(90), math.radians(-12 if side == "L" else 12)),
        )
        for i, oy in enumerate((-0.042, -0.014, 0.014, 0.040)):
            make_cone(
                f"Goat_Lash_{side}_{i}",
                0.007,
                0.032,
                (0.54, y + oy, 2.425),
                verts=6,
                material=m["lash"],
                rot=(math.radians(-16), math.radians(68), 0.0),
            )

    make_sphere("Goat_Nose", 0.095, (0.66, 0.00, 1.98), segs=18, rings=12, material=m["nose"], scale=(0.95, 1.18, 0.82))
    make_sphere("Goat_MouthCavity", 0.042, (0.56, 0.00, 1.88), segs=12, rings=8, material=m["mouth"], scale=(0.70, 0.90, 0.45))
    make_sphere("Goat_Tongue", 0.024, (0.58, 0.00, 1.87), segs=10, rings=6, material=m["tongue"], scale=(1.10, 0.70, 0.36))
    make_sphere("Goat_Smile", 0.058, (0.52, 0.00, 1.86), segs=12, rings=8, material=m["body"], scale=(0.55, 1.15, 0.32))

    make_torus("Goat_Scarf", 0.24, 0.048, (0.08, 0.00, 1.72), material=m["scarf"], rot=(math.radians(6), math.radians(8), 0.0))
    make_sphere("Goat_ScarfKnot", 0.062, (-0.24, 0.00, 1.68), segs=14, rings=10, material=m["scarf"], scale=(0.80, 1.05, 0.70))
    make_sphere("Goat_ScarfTail_A", 0.044, (-0.28, 0.05, 1.54), segs=12, rings=8, material=m["scarf"], scale=(0.45, 0.70, 1.25))
    make_sphere("Goat_ScarfTail_B", 0.040, (-0.26, -0.05, 1.52), segs=12, rings=8, material=m["scarf"], scale=(0.42, 0.65, 1.10))

    make_torus("Goat_CompassRing", 0.038, 0.008, (0.34, 0.00, 1.60), material=m["copper"], rot=(0.0, math.radians(90), 0.0), major_seg=20, minor_seg=8)
    make_torus("Goat_CompassRim", 0.078, 0.014, (0.38, 0.00, 1.46), material=m["teal"], rot=(0.0, math.radians(90), 0.0), major_seg=28, minor_seg=10)
    make_cylinder("Goat_CompassFace", 0.068, 0.016, (0.38, 0.00, 1.46), verts=28, material=m["face"], rot=(0.0, math.radians(90), 0.0))
    make_cone("Goat_NeedleN", 0.014, 0.052, (0.42, 0.00, 1.485), verts=8, material=m["needle_n"])
    make_cone("Goat_NeedleS", 0.014, 0.044, (0.42, 0.00, 1.435), verts=8, material=m["needle_s"], rot=(math.radians(180), 0.0, 0.0))

    for side, y in (("L", 0.44), ("R", -0.44)):
        make_sphere(f"Goat_UpperArm_{side}", 0.12, (0.08, y, 1.42), segs=18, rings=12, material=m["body"], scale=(0.80, 0.85, 1.05))
        make_cylinder(f"Goat_Arm_{side}", 0.062, 0.40, (0.12, y, 1.10), verts=14, material=m["body"])
        _cloven(f"Goat_Hand_{side}", (0.16, y, 0.86), m["hoof"], 0.060)

    for side, y in (("L", 0.16), ("R", -0.16)):
        make_sphere(f"Goat_Hip_{side}", 0.13, (0.02, y, 0.78), segs=16, rings=12, material=m["body"])
        make_cylinder(f"Goat_Leg_{side}", 0.080, 0.56, (0.05, y, 0.44), verts=16, material=m["body"])
        make_sphere(f"Goat_Ankle_{side}", 0.085, (0.08, y, 0.16), segs=14, rings=10, material=m["deep"], scale=(1.05, 1.00, 0.70))
        _cloven(f"Goat_Hoof_{side}", (0.12, y, 0.050), m["hoof"], 0.075, forward=0.02)

    tail = make_sphere("Goat_Tail", 0.10, (-0.44, 0.00, 0.90), segs=16, rings=12, material=m["body"], scale=(0.80, 0.70, 1.05))
    tail.rotation_euler = (0.0, math.radians(35), 0.0)

    apply_and_parent("Goat_", root, uv_names=())
    snap_root_to_ground(root, "Goat_")
    scale_root_to_height(root, "Goat_", pip_height * GOAT_SCALE)
    tagged(
        root,
        ddp_character_code="CHAR_GOAT_001",
        ddp_asset_id="char_goat_theatrical_production_rebuild_proposed",
        ddp_approved=False,
        ddp_quality="PROPOSED_PRODUCTION_REBUILD",
        ddp_theatrical_bound=False,
        ddp_stage="3_visual_gate",
    )
    mn, mx = world_bounds_objects(mesh_objects("Goat_"))
    patch_y = float(mesh_centroid(bpy.data.objects["Goat_EyePatch_L"]).y)
    return {
        "root": root.name,
        "height": mx.z - mn.z,
        "min": list(mn),
        "max": list(mx),
        "objects": sorted(obj.name for obj in mesh_objects("Goat_")),
        "left_eye_patch_y": patch_y,
        "left_eye_patch_character_left": patch_y > 0,
    }


def laterality_notes():
    notes = {}
    if "Pip_SatchelBag" in bpy.data.objects:
        bag = mesh_centroid(bpy.data.objects["Pip_SatchelBag"])
        notes["pip_bag_y"] = float(bag.y)
        notes["pip_bag_character_left"] = bag.y > 0
    if "Goat_EyePatch_L" in bpy.data.objects:
        patch = mesh_centroid(bpy.data.objects["Goat_EyePatch_L"])
        notes["goat_left_eye_patch_y"] = float(patch.y)
        notes["goat_patch_character_left"] = patch.y > 0
    return notes


def render_subject(prefix: str, stem: str, out_dir: Path) -> list[str]:
    setup_review_lighting()
    add_ground()
    mn, mx = world_bounds_objects(mesh_objects(prefix))
    center = (mn + mx) * 0.5
    height = max(mx.z - mn.z, 0.001)
    radius = max(mx.x - mn.x, mx.y - mn.y, height) * 1.45
    cam_z = center.z + height * 0.02
    views = {
        "front": (center + FACING * radius + Vector((0, 0, cam_z - center.z)), height * 1.28),
        "back": (center - FACING * radius + Vector((0, 0, cam_z - center.z)), height * 1.28),
        "side": (center + CHAR_LEFT * radius + Vector((0, 0, cam_z - center.z)), height * 1.28),
        "three_quarter": (
            center + (FACING * 0.72 + CHAR_LEFT * 0.72) * radius + Vector((0, 0, height * 0.08)),
            height * 1.32,
        ),
    }
    written = []
    for name, (loc, ortho) in views.items():
        cam = add_camera(f"{stem}_{name}", loc, center + Vector((0, 0, height * 0.02)), ortho)
        bpy.context.scene.camera = cam
        dest = out_dir / f"{stem}_{name}.png"
        render_path(dest)
        written.append(str(dest.relative_to(REPO_ROOT)))
    closeups = closeup_views(prefix, stem, center, height, radius, out_dir)
    written.extend(closeups)
    return written


def closeup_views(prefix: str, stem: str, center, height, radius, out_dir: Path) -> list[str]:
    written = []
    if prefix == "Pip_":
        targets = {
            "face": (
                center + Vector((0.10, 0.00, height * 0.30)),
                center + FACING * (height * 0.85) + Vector((0.00, 0.00, height * 0.30)),
                height * 0.52,
            ),
            "wing": (
                center + Vector((0.04, 0.20, -height * 0.02)),
                center + (FACING * 0.55 + CHAR_LEFT * 0.80) * (height * 0.80) + Vector((0.00, 0.00, -height * 0.02)),
                height * 0.58,
            ),
            "crest": (
                center + Vector((0.00, 0.00, height * 0.40)),
                center + CHAR_LEFT * (height * 0.70) + Vector((0.00, 0.00, height * 0.40)),
                height * 0.46,
            ),
            "satchel": (
                center + Vector((0.10, 0.16, -height * 0.08)),
                center + (FACING * 0.75 + CHAR_LEFT * 0.55) * (height * 0.75) + Vector((0.00, 0.00, -height * 0.08)),
                height * 0.55,
            ),
        }
    else:
        targets = {
            "face": (
                center + Vector((0.14, 0.00, height * 0.30)),
                center + FACING * (height * 0.90) + Vector((0.00, 0.00, height * 0.30)),
                height * 0.55,
            ),
            "horn_ear": (
                center + Vector((0.00, 0.10, height * 0.38)),
                center + (FACING * 0.45 + CHAR_LEFT * 0.70) * (height * 0.75) + Vector((0.00, 0.00, height * 0.38)),
                height * 0.50,
            ),
            "cinnamon_back": (
                center + Vector((-0.08, 0.00, height * 0.14)),
                center - FACING * (height * 0.80) + Vector((0.00, 0.00, height * 0.14)),
                height * 0.60,
            ),
            "compass": (
                center + Vector((0.16, 0.00, height * 0.10)),
                center + FACING * (height * 0.55) + Vector((0.00, 0.00, height * 0.10)),
                height * 0.40,
            ),
        }
    for name, (focus, loc, ortho) in targets.items():
        cam = add_camera(f"{stem}_{name}", loc, focus, ortho)
        bpy.context.scene.camera = cam
        dest = out_dir / f"{stem}_{name}.png"
        render_path(dest, samples=28)
        written.append(str(dest.relative_to(REPO_ROOT)))
    return written


def append_blend(path: Path):
    with bpy.data.libraries.load(str(path), link=False) as (src, dst):
        dst.objects = list(src.objects)
    imported = []
    for obj in dst.objects:
        if obj is None:
            continue
        if obj.name not in bpy.context.collection.objects:
            bpy.context.collection.objects.link(obj)
        imported.append(obj)
    return imported


def render_pair(pip_blend: Path, goat_blend: Path, out_dir: Path) -> dict:
    reset_scene()
    append_blend(pip_blend)
    append_blend(goat_blend)
    pip_root = bpy.data.objects.get("Pip_Root")
    goat_root = bpy.data.objects.get("Goat_Root")
    if pip_root:
        pip_root.location.y = -0.95
    if goat_root:
        goat_root.location.y = 1.15
    bpy.context.view_layer.update()
    setup_review_lighting()
    add_ground()
    both = mesh_objects("Pip_") + mesh_objects("Goat_")
    mn, mx = world_bounds_objects(both)
    center = (mn + mx) * 0.5
    height = max(mx.z - mn.z, 0.001)
    span = max(mx.x - mn.x, mx.y - mn.y, height)
    views = {
        "front": (center + FACING * span * 1.35 + Vector((0, 0, height * 0.04)), max(span * 1.15, height * 1.72)),
        "three_quarter": (
            center + (FACING * 0.75 + CHAR_LEFT * 0.75) * span * 1.25 + Vector((0, 0, height * 0.08)),
            max(span * 1.20, height * 1.78),
        ),
        "side": (center + CHAR_LEFT * span * 1.35 + Vector((0, 0, height * 0.04)), max(span * 1.15, height * 1.75)),
    }
    written = []
    for name, (loc, ortho) in views.items():
        cam = add_camera(f"pair_{name}", loc, center + Vector((0, 0, height * 0.02)), ortho)
        bpy.context.scene.camera = cam
        dest = out_dir / f"pair_{name}.png"
        render_path(dest, samples=28)
        written.append(str(dest.relative_to(REPO_ROOT)))
    pip_h = world_bounds_objects(mesh_objects("Pip_"))
    goat_h = world_bounds_objects(mesh_objects("Goat_"))
    ph = pip_h[1].z - pip_h[0].z
    gh = goat_h[1].z - goat_h[0].z
    laterality = {}
    if "Pip_SatchelBag" in bpy.data.objects and pip_root:
        bag_y = float(mesh_centroid(bpy.data.objects["Pip_SatchelBag"]).y - pip_root.location.y)
        laterality["pip_bag_y"] = bag_y
        laterality["pip_bag_character_left"] = bag_y > 0
    if "Goat_EyePatch_L" in bpy.data.objects and goat_root:
        patch_y = float(mesh_centroid(bpy.data.objects["Goat_EyePatch_L"]).y - goat_root.location.y)
        laterality["goat_left_eye_patch_y"] = patch_y
        laterality["goat_patch_character_left"] = patch_y > 0
    return {
        "renders": written,
        "pip_height": ph,
        "goat_height": gh,
        "ratio": gh / ph if ph else 0.0,
        "laterality": laterality,
    }


def main() -> int:
    out_dir = ARTIFACTS / "clean"
    out_dir.mkdir(parents=True, exist_ok=True)
    pip_blend = PROPOSED_REBUILD / "pip_theatrical_production_rebuild.blend"
    goat_blend = PROPOSED_REBUILD / "goat_theatrical_production_rebuild.blend"
    assert_not_production_library(pip_blend)
    assert_not_production_library(goat_blend)

    pip_info = build_pip()
    save_blend(pip_blend)
    pip_renders = render_subject("Pip_", "pip_rebuild", out_dir)

    goat_info = build_goat(pip_info["height"])
    save_blend(goat_blend)
    goat_renders = render_subject("Goat_", "goat_rebuild", out_dir)

    pair = render_pair(pip_blend, goat_blend, out_dir)
    report = {
        "approved": False,
        "canonical_mutated": False,
        "theatrical_bound": False,
        "merge": False,
        "retopo": False,
        "groom": False,
        "rig": False,
        "glb_used": False,
        "paid_resources": False,
        "stage": "3_visual_gate",
        "authority": "ten five-view binding JPEGs",
        "pip": pip_info,
        "goat": goat_info,
        "pair": pair,
        "renders": pip_renders + goat_renders + pair["renders"],
        "outputs": {
            "pip_blend": str(pip_blend.relative_to(REPO_ROOT)),
            "goat_blend": str(goat_blend.relative_to(REPO_ROOT)),
        },
    }
    (ARTIFACTS / "REBUILD.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"ok": True, "ratio": pair["ratio"], "renders": len(report["renders"])}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
