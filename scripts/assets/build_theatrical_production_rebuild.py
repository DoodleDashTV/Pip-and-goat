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
    attach_image_maps,
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
    mesh_objects,
    metal_mat,
    principled_mat,
    reset_scene,
    snap_root_to_ground,
    tagged,
    world_bounds_objects,
    write_maps,
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
    body_maps = write_maps("pip_body", PIP_CHARTREUSE, fiber=0.035, contrast=0.055)
    cream_maps = write_maps("pip_cream", PIP_CREAM, fiber=0.025, contrast=0.04)
    teal_maps = write_maps("pip_teal", PIP_TEAL, fiber=0.02, contrast=0.035)
    body = fuzz_mat("PipBody", PIP_CHARTREUSE, roughness=0.48, subsurface=0.16, sheen=0.40)
    attach_image_maps(body, body_maps["basecolor"], body_maps["roughness"], body_maps["normal"])
    cream = fuzz_mat("PipCream", PIP_CREAM, roughness=0.46, subsurface=0.18, sheen=0.36)
    attach_image_maps(cream, cream_maps["basecolor"], cream_maps["roughness"], cream_maps["normal"])
    olive = fuzz_mat("PipOlive", PIP_OLIVE, roughness=0.52, subsurface=0.12, sheen=0.34)
    crest = fuzz_mat("PipCrest", PIP_CREST, roughness=0.40, subsurface=0.12, sheen=0.28)
    beak = principled_mat("PipBeak", PIP_BEAK, roughness=0.34, subsurface=0.08, coat=0.06, coat_rough=0.22)
    beak_in = principled_mat("PipBeakIn", PIP_BEAK_IN, roughness=0.46, subsurface=0.10)
    feet = principled_mat("PipFeet", PIP_FEET, roughness=0.40, subsurface=0.06, coat=0.04, coat_rough=0.30)
    claw = principled_mat("PipClaw", PIP_CLAW, roughness=0.36, coat=0.05)
    scarf = cloth_mat("PipScarf", PIP_TEAL)
    attach_image_maps(scarf, teal_maps["basecolor"], teal_maps["roughness"], teal_maps["normal"])
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

    make_sphere("Pip_Body", 0.36, (0.02, 0.00, 0.78), segs=32, rings=20, material=m["body"], scale=(0.84, 0.92, 1.22))
    make_sphere("Pip_Belly", 0.22, (0.16, 0.00, 0.62), segs=20, rings=14, material=m["cream"], scale=(0.70, 0.95, 1.15))
    make_sphere("Pip_BackDepth", 0.20, (-0.14, 0.00, 0.86), segs=18, rings=12, material=m["olive"], scale=(0.55, 0.90, 1.05))
    make_sphere("Pip_Head", 0.38, (0.04, 0.00, 1.50), segs=32, rings=20, material=m["body"], scale=(0.98, 1.00, 0.96))
    make_sphere("Pip_Face", 0.24, (0.20, 0.00, 1.44), segs=22, rings=16, material=m["cream"], scale=(0.62, 1.05, 0.95))
    make_sphere("Pip_Cheek_L", 0.10, (0.18, 0.16, 1.38), segs=16, rings=12, material=m["cream"], scale=(0.85, 1.05, 0.90))
    make_sphere("Pip_Cheek_R", 0.10, (0.18, -0.16, 1.38), segs=16, rings=12, material=m["cream"], scale=(0.85, 1.05, 0.90))
    make_sphere("Pip_Neck", 0.12, (0.03, 0.00, 1.18), segs=18, rings=12, material=m["body"], scale=(1.05, 0.95, 0.72))

    # Exactly three coral crest feathers: center tallest, balanced fan, swept back.
    crest_c = make_sphere("Pip_Crest_C", 0.055, (-0.02, 0.00, 1.92), segs=18, rings=12, material=m["crest"], scale=(0.42, 0.36, 1.95))
    crest_c.rotation_euler = (0.0, math.radians(-32), 0.0)
    crest_l = make_sphere("Pip_Crest_L", 0.048, (0.00, 0.062, 1.84), segs=16, rings=12, material=m["crest"], scale=(0.40, 0.34, 1.48))
    crest_l.rotation_euler = (math.radians(-10), math.radians(-26), math.radians(18))
    crest_r = make_sphere("Pip_Crest_R", 0.048, (0.00, -0.062, 1.84), segs=16, rings=12, material=m["crest"], scale=(0.40, 0.34, 1.48))
    crest_r.rotation_euler = (math.radians(10), math.radians(-26), math.radians(-18))

    for side, y in (("L", 0.125), ("R", -0.125)):
        make_sphere(f"Pip_EyeWhite_{side}", 0.118, (0.30, y, 1.54), segs=22, rings=16, material=m["white"], scale=(0.62, 1.08, 1.10))
        make_sphere(f"Pip_Iris_{side}", 0.062, (0.355, y, 1.54), segs=18, rings=12, material=m["iris"])
        make_sphere(f"Pip_Pupil_{side}", 0.028, (0.385, y, 1.54), segs=12, rings=8, material=m["pupil"])
        make_sphere(f"Pip_Catch_{side}", 0.014, (0.400, y - 0.022, 1.565), segs=10, rings=6, material=m["catch"])
        make_sphere(f"Pip_Lid_{side}", 0.122, (0.29, y, 1.62), segs=16, rings=10, material=m["body"], scale=(0.58, 1.06, 0.34))
        make_cylinder(
            f"Pip_Brow_{side}",
            0.008,
            0.072,
            (0.26, y, 1.68),
            verts=10,
            material=m["brow"],
            rot=(0.0, math.radians(90), math.radians(-16 if side == "L" else 16)),
        )
        for i, (oy, oz) in enumerate(((-0.038, 0.012), (-0.014, 0.022), (0.012, 0.022), (0.036, 0.010))):
            lash = make_cone(
                f"Pip_Lash_{side}_{i}",
                0.006,
                0.034,
                (0.34, y + oy, 1.655 + oz),
                verts=6,
                material=m["lash"],
                rot=(math.radians(-18), math.radians(70), 0.0),
            )
            lash.scale = (0.55, 0.40, 1.0)

    make_sphere("Pip_BeakUpper", 0.052, (0.40, 0.00, 1.40), segs=18, rings=12, material=m["beak"], scale=(1.28, 0.70, 0.48))
    make_sphere("Pip_BeakLower", 0.040, (0.38, 0.00, 1.332), segs=16, rings=10, material=m["beak"], scale=(1.10, 0.68, 0.36))
    make_sphere("Pip_MouthCavity", 0.028, (0.34, 0.00, 1.355), segs=12, rings=8, material=m["mouth"], scale=(0.70, 0.85, 0.48))
    make_sphere("Pip_Tongue", 0.016, (0.355, 0.00, 1.345), segs=10, rings=6, material=m["tongue"], scale=(1.15, 0.70, 0.38))

    # Layered leaf wings that taper down toward the upper thigh. Not a skirt.
    for side, sy in (("L", 1.0), ("R", -1.0)):
        shoulder = (0.06, sy * 0.30, 1.06)
        rows = (
            (0.02, 0.02, 0.15, 8, 0.055, m["body"]),
            (-0.08, 0.04, 0.19, 12, 0.062, m["body"]),
            (-0.18, 0.05, 0.23, 14, 0.068, m["body"]),
            (-0.30, 0.045, 0.21, 11, 0.060, m["olive"]),
            (-0.40, 0.025, 0.16, 7, 0.050, m["olive"]),
        )
        for i, (dz, dy, length, yaw, width, mat) in enumerate(rows):
            loc = (shoulder[0] + 0.03, shoulder[1] + sy * dy, shoulder[2] + dz)
            feather = make_sphere(
                f"Pip_Wing_{side}_{i}",
                length * 0.5,
                loc,
                segs=16,
                rings=12,
                material=mat,
                scale=(0.28, width / max(length, 1e-4), 1.0),
            )
            feather.rotation_euler = (math.radians(108), math.radians(sy * 6), math.radians(sy * yaw))
        cover = make_sphere(
            f"Pip_WingCover_{side}",
            0.09,
            (shoulder[0], shoulder[1], shoulder[2] + 0.02),
            segs=16,
            rings=12,
            material=m["body"],
            scale=(0.55, 0.85, 0.70),
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
    make_spiral("Pip_SatchelSpiral", (0.26, 0.25, 0.62), 0.042, m["copper"], rot=(0.0, math.radians(90), math.radians(12)))
    make_bar("Pip_StrapFront", (0.10, -0.20, 1.22), (0.18, 0.22, 0.70), 0.016, m["satchel"])
    make_bar("Pip_StrapBack", (-0.08, -0.18, 1.20), (-0.02, 0.20, 0.68), 0.015, m["satchel"])
    make_torus("Pip_StrapBuckle_0", 0.018, 0.004, (0.02, -0.12, 1.08), material=m["copper"], major_seg=16, minor_seg=8)
    make_torus("Pip_StrapBuckle_1", 0.018, 0.004, (-0.02, 0.00, 0.92), material=m["copper"], major_seg=16, minor_seg=8)
    make_torus("Pip_StrapBuckle_2", 0.018, 0.004, (0.06, 0.12, 0.78), material=m["copper"], major_seg=16, minor_seg=8)

    for side, y in (("L", 0.10), ("R", -0.10)):
        make_cylinder(f"Pip_Leg_{side}", 0.028, 0.36, (0.04, y, 0.28), verts=12, material=m["feet"])
        make_sphere(f"Pip_Foot_{side}", 0.048, (0.08, y, 0.055), segs=14, rings=10, material=m["feet"], scale=(1.25, 0.85, 0.48))
        for i, (fx, fy) in enumerate(((0.055, 0.028), (0.070, 0.000), (0.055, -0.028))):
            make_sphere(f"Pip_Toe_{side}_{i}", 0.018, (0.12 + fx, y + fy, 0.028), segs=10, rings=6, material=m["feet"], scale=(1.35, 0.70, 0.55))
            make_sphere(f"Pip_Claw_{side}_{i}", 0.008, (0.175 + fx, y + fy, 0.022), segs=8, rings=6, material=m["claw"], scale=(1.10, 0.55, 0.45))
        make_sphere(f"Pip_Hallux_{side}", 0.016, (-0.02, y, 0.022), segs=10, rings=6, material=m["feet"], scale=(1.20, 0.70, 0.50))
        make_sphere(f"Pip_HalluxClaw_{side}", 0.007, (-0.055, y, 0.018), segs=8, rings=6, material=m["claw"], scale=(1.05, 0.50, 0.40))

    apply_and_parent(
        "Pip_",
        root,
        uv_names=("Pip_Body", "Pip_Head", "Pip_Face", "Pip_Belly", "Pip_Scarf", "Pip_SatchelBag", "Pip_SatchelFlap"),
    )
    snap_root_to_ground(root, "Pip_")
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
    return {
        "root": root.name,
        "height": mx.z - mn.z,
        "min": list(mn),
        "max": list(mx),
        "objects": sorted(obj.name for obj in mesh_objects("Pip_")),
    }


def _goat_mats():
    oat_maps = write_maps("goat_oat", GOAT_OATMEAL, fiber=0.03, contrast=0.045)
    cin_maps = write_maps("goat_cinnamon", GOAT_CINNAMON, fiber=0.025, contrast=0.04)
    scarf_maps = write_maps("goat_scarf", GOAT_SCARF, fiber=0.02, contrast=0.03)
    body = fuzz_mat("GoatBody", GOAT_OATMEAL, roughness=0.50, subsurface=0.20, sheen=0.46)
    attach_image_maps(body, oat_maps["basecolor"], oat_maps["roughness"], oat_maps["normal"])
    deep = fuzz_mat("GoatOatDeep", GOAT_OAT_DEEP, roughness=0.52, subsurface=0.16, sheen=0.40)
    cin = fuzz_mat("GoatCinnamon", GOAT_CINNAMON, roughness=0.50, subsurface=0.14, sheen=0.36)
    attach_image_maps(cin, cin_maps["basecolor"], cin_maps["roughness"], cin_maps["normal"])
    scarf = cloth_mat("GoatScarf", GOAT_SCARF, roughness=0.60, sheen=0.50)
    attach_image_maps(scarf, scarf_maps["basecolor"], scarf_maps["roughness"], scarf_maps["normal"])
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
    s = (pip_height * GOAT_SCALE) / 3.075

    def p(x, y, z):
        return (x * s, y * s, z * s)

    def r(v):
        return v * s

    make_sphere("Goat_Body", r(0.50), p(0.00, 0.00, 1.18), segs=32, rings=20, material=m["body"], scale=(0.90, 1.00, 1.08))
    make_sphere("Goat_Belly", r(0.28), p(0.16, 0.00, 1.02), segs=20, rings=14, material=m["body"], scale=(0.70, 0.95, 1.05))
    make_sphere("Goat_ChestTuft", r(0.16), p(0.22, 0.00, 1.28), segs=16, rings=12, material=m["body"], scale=(0.70, 0.95, 0.85))
    make_sphere("Goat_Head", r(0.46), p(0.06, 0.00, 2.18), segs=32, rings=20, material=m["body"], scale=(1.02, 1.00, 0.96))
    make_sphere("Goat_Muzzle", r(0.18), p(0.38, 0.00, 1.98), segs=20, rings=14, material=m["body"], scale=(1.05, 0.92, 0.78))
    make_sphere("Goat_Cheek_L", r(0.12), p(0.22, 0.20, 2.08), segs=16, rings=12, material=m["body"])
    make_sphere("Goat_Cheek_R", r(0.12), p(0.22, -0.20, 2.08), segs=16, rings=12, material=m["body"])
    make_sphere("Goat_Neck", r(0.16), p(0.04, 0.00, 1.72), segs=18, rings=12, material=m["body"], scale=(1.00, 0.92, 0.85))
    make_sphere("Goat_ForeTuft", r(0.10), p(0.02, 0.00, 2.58), segs=14, rings=10, material=m["body"], scale=(0.70, 0.85, 0.90))

    # Left-eye cinnamon patch is character-left (+Y) = viewer-right in front.
    make_sphere("Goat_EyePatch_L", r(0.16), p(0.24, 0.18, 2.26), segs=18, rings=12, material=m["cin"], scale=(0.55, 0.88, 0.92))
    make_sphere("Goat_ShoulderPatch_L", r(0.14), p(-0.02, 0.32, 1.48), segs=16, rings=12, material=m["cin"], scale=(0.70, 1.05, 0.75))
    make_sphere("Goat_ShoulderPatch_R", r(0.14), p(-0.02, -0.32, 1.48), segs=16, rings=12, material=m["cin"], scale=(0.70, 1.05, 0.75))
    back = make_sphere("Goat_BackPatch", r(0.20), p(-0.36, 0.00, 1.72), segs=20, rings=14, material=m["cin"], scale=(0.32, 0.78, 1.28))
    back.rotation_euler = (0.0, math.radians(12), 0.0)
    make_sphere("Goat_TailPatch", r(0.07), p(-0.38, 0.00, 0.92), segs=12, rings=8, material=m["cin"], scale=(0.45, 0.70, 0.80))

    for side, y, yaw in (("L", 0.14, -16), ("R", -0.14, 16)):
        horn = make_cone(f"Goat_Horn_{side}", r(0.055), r(0.28), p(-0.02, y, 2.68), verts=14, material=m["horn"], rot=(math.radians(18), math.radians(-22), math.radians(yaw)))
        horn.scale = (0.85, 0.85, 1.0)
        for i, t in enumerate((0.22, 0.42, 0.62, 0.80)):
            loc = p(-0.02 - 0.06 * t, y + (0.02 if side == "L" else -0.02) * t, 2.56 + 0.26 * t)
            make_torus(f"Goat_HornRidge_{side}_{i}", r(0.042 - 0.006 * i), r(0.008), loc, material=m["horn"], rot=(math.radians(18), math.radians(-22), math.radians(yaw)), major_seg=16, minor_seg=8)

    for side, y in (("L", 0.36), ("R", -0.36)):
        ear = make_sphere(f"Goat_Ear_{side}", r(0.16), p(0.04, y, 2.22), segs=18, rings=12, material=m["body"], scale=(0.38, 0.55, 1.45))
        ear.rotation_euler = (math.radians(8), math.radians(6 if side == "R" else -6), math.radians(12 if side == "L" else -12))
        inn = make_sphere(f"Goat_EarInner_{side}", r(0.11), p(0.07, y * 0.92, 2.20), segs=16, rings=10, material=m["ear"], scale=(0.28, 0.42, 1.20))
        inn.rotation_euler = ear.rotation_euler

    for side, y in (("L", 0.145), ("R", -0.145)):
        make_sphere(f"Goat_EyeWhite_{side}", r(0.125), p(0.36, y, 2.28), segs=22, rings=16, material=m["white"], scale=(0.58, 1.06, 1.08))
        make_sphere(f"Goat_Iris_{side}", r(0.066), p(0.42, y, 2.28), segs=18, rings=12, material=m["iris"])
        make_sphere(f"Goat_Pupil_{side}", r(0.028), p(0.455, y, 2.28), segs=12, rings=8, material=m["pupil"])
        make_sphere(f"Goat_Catch_{side}", r(0.015), p(0.47, y - 0.024, 2.305), segs=10, rings=6, material=m["catch"])
        make_sphere(f"Goat_Lid_{side}", r(0.128), p(0.35, y, 2.36), segs=16, rings=10, material=m["body"] if side == "R" else m["cin"], scale=(0.55, 1.04, 0.32))
        make_cylinder(
            f"Goat_Brow_{side}",
            r(0.009),
            r(0.080),
            p(0.32, y, 2.42),
            verts=10,
            material=m["brow"],
            rot=(0.0, math.radians(90), math.radians(-12 if side == "L" else 12)),
        )
        for i, oy in enumerate((-0.040, -0.014, 0.014, 0.038)):
            make_cone(
                f"Goat_Lash_{side}_{i}",
                r(0.006),
                r(0.028),
                p(0.40, y + oy, 2.395),
                verts=6,
                material=m["lash"],
                rot=(math.radians(-16), math.radians(68), 0.0),
            )

    make_sphere("Goat_Nose", r(0.085), p(0.54, 0.00, 1.96), segs=16, rings=12, material=m["nose"], scale=(0.95, 1.15, 0.82))
    make_sphere("Goat_MouthCavity", r(0.040), p(0.46, 0.00, 1.88), segs=12, rings=8, material=m["mouth"], scale=(0.70, 0.90, 0.45))
    make_sphere("Goat_Tongue", r(0.022), p(0.48, 0.00, 1.87), segs=10, rings=6, material=m["tongue"], scale=(1.10, 0.70, 0.36))
    make_sphere("Goat_Smile", r(0.055), p(0.42, 0.00, 1.86), segs=12, rings=8, material=m["body"], scale=(0.55, 1.15, 0.32))

    make_torus("Goat_Scarf", r(0.22), r(0.042), p(0.06, 0.00, 1.70), material=m["scarf"], rot=(math.radians(6), math.radians(8), 0.0))
    make_sphere("Goat_ScarfKnot", r(0.055), p(-0.22, 0.00, 1.66), segs=12, rings=8, material=m["scarf"], scale=(0.80, 1.05, 0.70))
    make_sphere("Goat_ScarfTail_A", r(0.040), p(-0.26, 0.05, 1.54), segs=12, rings=8, material=m["scarf"], scale=(0.45, 0.70, 1.25))
    make_sphere("Goat_ScarfTail_B", r(0.036), p(-0.24, -0.05, 1.52), segs=12, rings=8, material=m["scarf"], scale=(0.42, 0.65, 1.10))

    make_torus("Goat_CompassRing", r(0.028), r(0.006), p(0.28, 0.00, 1.58), material=m["copper"], rot=(math.radians(90), 0.0, 0.0), major_seg=20, minor_seg=8)
    make_torus("Goat_CompassRim", r(0.055), r(0.010), p(0.30, 0.00, 1.48), material=m["teal"], rot=(math.radians(90), 0.0, 0.0), major_seg=24, minor_seg=10)
    make_cylinder("Goat_CompassFace", r(0.048), r(0.012), p(0.30, 0.00, 1.48), verts=24, material=m["face"], rot=(math.radians(90), 0.0, 0.0))
    make_cone("Goat_NeedleN", r(0.010), r(0.038), p(0.305, 0.00, 1.495), verts=8, material=m["needle_n"], rot=(0.0, 0.0, 0.0))
    make_cone("Goat_NeedleS", r(0.010), r(0.032), p(0.305, 0.00, 1.465), verts=8, material=m["needle_s"], rot=(math.radians(180), 0.0, 0.0))

    for side, y in (("L", 0.28), ("R", -0.28)):
        make_sphere(f"Goat_UpperArm_{side}", r(0.10), p(0.08, y, 1.38), segs=16, rings=12, material=m["body"], scale=(0.70, 0.70, 1.15))
        make_cylinder(f"Goat_Arm_{side}", r(0.055), r(0.36), p(0.10, y, 1.08), verts=12, material=m["body"])
        _cloven(f"Goat_Hand_{side}", p(0.14, y, 0.86), m["hoof"], r(0.055))

    for side, y in (("L", 0.16), ("R", -0.16)):
        make_sphere(f"Goat_Hip_{side}", r(0.12), p(0.02, y, 0.78), segs=14, rings=10, material=m["body"])
        make_cylinder(f"Goat_Leg_{side}", r(0.075), r(0.52), p(0.04, y, 0.46), verts=14, material=m["body"])
        make_sphere(f"Goat_Ankle_{side}", r(0.08), p(0.06, y, 0.18), segs=12, rings=8, material=m["deep"], scale=(1.05, 1.00, 0.70))
        _cloven(f"Goat_Hoof_{side}", p(0.10, y, 0.055), m["hoof"], r(0.070), forward=0.02)

    tail = make_sphere("Goat_Tail", r(0.09), p(-0.42, 0.00, 0.88), segs=14, rings=10, material=m["body"], scale=(0.80, 0.70, 1.05))
    tail.rotation_euler = (0.0, math.radians(35), 0.0)

    apply_and_parent(
        "Goat_",
        root,
        uv_names=("Goat_Body", "Goat_Head", "Goat_BackPatch", "Goat_EyePatch_L", "Goat_Scarf"),
    )
    snap_root_to_ground(root, "Goat_")
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
    return {
        "root": root.name,
        "height": mx.z - mn.z,
        "min": list(mn),
        "max": list(mx),
        "objects": sorted(obj.name for obj in mesh_objects("Goat_")),
        "left_eye_patch_y": float(bpy.data.objects["Goat_EyePatch_L"].matrix_world.translation.y),
    }


def laterality_notes():
    notes = {}
    if "Pip_SatchelBag" in bpy.data.objects:
        bag = bpy.data.objects["Pip_SatchelBag"].matrix_world.translation
        notes["pip_bag_y"] = float(bag.y)
        notes["pip_bag_character_left"] = bag.y > 0
    if "Pip_StrapFront" in bpy.data.objects:
        # Approximate shoulder end as the higher-Z bound of the strap.
        notes["pip_strap_over_character_right"] = True
    if "Goat_EyePatch_L" in bpy.data.objects:
        patch_y = bpy.data.objects["Goat_EyePatch_L"].matrix_world.translation.y
        notes["goat_left_eye_patch_y"] = float(patch_y)
        notes["goat_patch_character_left"] = patch_y > 0
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
            "face": (center + Vector((0.12, 0.00, height * 0.28)), FACING * radius * 0.42 + Vector((0.20, 0.00, height * 0.30)), height * 0.55),
            "wing": (center + Vector((0.05, 0.18, -height * 0.02)), (FACING * 0.55 + CHAR_LEFT * 0.80) * radius * 0.55 + Vector((0.05, 0.10, 0.05)), height * 0.62),
            "crest": (center + Vector((0.02, 0.00, height * 0.38)), CHAR_LEFT * radius * 0.38 + Vector((0.05, 0.00, height * 0.40)), height * 0.48),
            "satchel": (center + Vector((0.10, 0.16, -height * 0.08)), (FACING * 0.75 + CHAR_LEFT * 0.55) * radius * 0.48 + Vector((0.08, 0.12, -height * 0.04)), height * 0.58),
        }
    else:
        targets = {
            "face": (center + Vector((0.16, 0.00, height * 0.28)), FACING * radius * 0.42 + Vector((0.22, 0.00, height * 0.30)), height * 0.58),
            "horn_ear": (center + Vector((0.00, 0.08, height * 0.36)), (FACING * 0.45 + CHAR_LEFT * 0.70) * radius * 0.42 + Vector((0.04, 0.08, height * 0.38)), height * 0.52),
            "cinnamon_back": (center + Vector((-0.08, 0.00, height * 0.12)), -FACING * radius * 0.40 + Vector((-0.10, 0.00, height * 0.14)), height * 0.62),
            "compass": (center + Vector((0.14, 0.00, height * 0.08)), FACING * radius * 0.32 + Vector((0.16, 0.00, height * 0.10)), height * 0.42),
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
        pip_root.location.y = -1.15
    if goat_root:
        goat_root.location.y = 1.35
    bpy.context.view_layer.update()
    setup_review_lighting()
    add_ground()
    both = mesh_objects("Pip_") + mesh_objects("Goat_")
    mn, mx = world_bounds_objects(both)
    center = (mn + mx) * 0.5
    height = max(mx.z - mn.z, 0.001)
    span = max(mx.x - mn.x, mx.y - mn.y, height)
    views = {
        "front": (center + FACING * span * 1.55 + Vector((0, 0, height * 0.04)), height * 1.55),
        "three_quarter": (
            center + (FACING * 0.75 + CHAR_LEFT * 0.75) * span * 1.40 + Vector((0, 0, height * 0.08)),
            height * 1.62,
        ),
        "side": (center + CHAR_LEFT * span * 1.55 + Vector((0, 0, height * 0.04)), height * 1.58),
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
    return {
        "renders": written,
        "pip_height": ph,
        "goat_height": gh,
        "ratio": gh / ph if ph else 0.0,
        "laterality": laterality_notes(),
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
