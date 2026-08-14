"""Build proposed theatrical v1 assets outside production-library/.

  blender -b -noaudio --python scripts/assets/build_theatrical_v1.py
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

from theatrical_v1_common import (  # noqa: E402
    GOAT_COLLAR,
    GOAT_CREAM,
    GOAT_EAR_IN,
    GOAT_HOOF,
    GOAT_HORN,
    GOAT_IRIS,
    GOAT_NOSE,
    GOAT_TAG,
    PIP_BEAK,
    PIP_COMB,
    PIP_FEET,
    PIP_GOLD,
    PIP_IRIS,
    PIP_PURPLE,
    PIP_STRAP,
    PIP_YELLOW,
    PROPOSED,
    SHAPE_KEYS,
    add_action,
    add_shape_keys,
    append_canonical_actions,
    apply_all,
    assert_not_production_library,
    attach_image_maps,
    ensure_armature,
    ensure_uv,
    heat_weights,
    join_named,
    link,
    parent_armature,
    principled_mat,
    reset_scene,
    sculpt_shape_key,
    smooth,
    voxel_unify,
    write_variation_maps,
)

LIB_PIP = REPO_ROOT / "production-library/characters/pip_production.blend"
LIB_GOAT = REPO_ROOT / "production-library/characters/goat_production.blend"


def sphere(name, radius, loc, segs=24, rings=16, scale=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=segs, ring_count=rings)
    obj = bpy.context.object
    obj.name = name
    if scale:
        obj.scale = scale
    return obj


def cylinder(name, radius, depth, loc, verts=16, rot=None):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=loc, vertices=verts)
    obj = bpy.context.object
    obj.name = name
    if rot:
        obj.rotation_euler = rot
    return obj


def cone(name, radius, depth, loc, rot=None, verts=16):
    bpy.ops.mesh.primitive_cone_add(radius1=radius, depth=depth, location=loc, vertices=verts)
    obj = bpy.context.object
    obj.name = name
    if rot:
        obj.rotation_euler = rot
    return obj


def assign_mat(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def feather_cards(prefix, host, color_mat, count=48, length=0.034, seed=7):
    """Controlled stylized cards — volume without noisy groom."""
    import random

    rng = random.Random(seed)
    cards = []
    verts = list(host.data.vertices)
    rng.shuffle(verts)
    for i, vert in enumerate(verts[:count]):
        n = vert.normal
        if n.z < -0.15 and vert.co.z < 0.12:
            continue
        loc = host.matrix_world @ vert.co + n.normalized() * 0.006
        bpy.ops.mesh.primitive_plane_add(size=length, location=loc)
        card = bpy.context.object
        card.name = f"{prefix}_Feather_{i:02d}"
        card.rotation_euler = n.to_track_quat("Z", "Y").to_euler()
        card.scale = (0.45, 1.15, 1.0)
        assign_mat(card, color_mat)
        cards.append(card)
    if not cards:
        return None
    for card in cards:
        apply_all(card)
    bpy.ops.object.select_all(action="DESELECT")
    for card in cards:
        card.select_set(True)
    bpy.context.view_layer.objects.active = cards[0]
    bpy.ops.object.join()
    groom = bpy.context.object
    groom.name = f"{prefix}_Groom"
    smooth(groom)
    return groom


def star_mesh(name, loc, radius, mat):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=0.008, location=loc, vertices=5)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (math.radians(90), 0, 0)
    assign_mat(obj, mat)
    return obj


def build_pip():
    reset_scene()
    maps = write_variation_maps("pip_body", PIP_YELLOW)
    body_mat = principled_mat("PipBody", PIP_YELLOW, roughness=0.48, subsurface=0.22, sheen=0.52)
    attach_image_maps(body_mat, maps["basecolor"], maps["roughness"], maps["normal"])
    comb_mat = principled_mat("PipComb", PIP_COMB, roughness=0.34, subsurface=0.16, sheen=0.28)
    beak_mat = principled_mat("PipBeak", PIP_BEAK, roughness=0.30, subsurface=0.08, coat=0.10)
    feet_mat = principled_mat("PipFeet", PIP_FEET, roughness=0.36, subsurface=0.08, coat=0.06)
    pack_mat = principled_mat("PipBackpack", PIP_PURPLE, roughness=0.40, sheen=0.22)
    strap_mat = principled_mat("PipStrap", PIP_STRAP, roughness=0.42, sheen=0.18)
    gold_mat = principled_mat("PipStar", PIP_GOLD, roughness=0.22, metallic=0.42, coat=0.12)
    white = principled_mat("PipEyeWhite", (0.99, 0.99, 0.99), roughness=0.06, specular=0.72, coat=0.32, coat_rough=0.04)
    iris = principled_mat("PipIris", PIP_IRIS, roughness=0.20, coat=0.18)
    pupil = principled_mat("PipPupil", (0.04, 0.03, 0.03), roughness=0.16)
    catch = principled_mat("PipCatchlight", (1, 1, 1), roughness=0.05, coat=0.4, emission=0.18)
    brow_mat = principled_mat("PipBrow", (0.10, 0.05, 0.03), roughness=0.55)
    tongue = principled_mat("PipTongue", (0.86, 0.28, 0.32), roughness=0.35, subsurface=0.2)
    mouth = principled_mat("PipMouth", (0.35, 0.08, 0.10), roughness=0.45)

    # Unified pear body + oversized head as overlapping volumes, then remesh.
    sphere("Pip_BodyCore", 0.138, (0.0, 0.012, 0.200), segs=32, rings=20, scale=(1.08, 0.96, 1.18))
    sphere("Pip_Belly", 0.118, (0.0, 0.02, 0.168), segs=24, rings=16, scale=(1.12, 1.02, 0.85))
    sphere("Pip_HeadCore", 0.162, (0.0, -0.012, 0.412), segs=32, rings=20, scale=(1.04, 1.00, 1.02))
    sphere("Pip_CheekL", 0.055, (-0.078, -0.055, 0.372), segs=16, rings=12)
    sphere("Pip_CheekR", 0.055, (0.078, -0.055, 0.372), segs=16, rings=12)
    sphere("Pip_Neck", 0.062, (0.0, 0.0, 0.318), segs=16, rings=12, scale=(1.15, 0.95, 0.85))
    for side, x in (("L", -0.168), ("R", 0.168)):
        cylinder(f"Pip_WingArm_{side}", 0.028, 0.16, (x, 0.01, 0.236), verts=16, rot=(0, math.radians(90 if side == "R" else -90), math.radians(12)))
        sphere(f"Pip_WingTip_{side}", 0.042, (x + (-0.09 if side == "L" else 0.09), 0.02, 0.220), segs=16, rings=12, scale=(0.7, 1.35, 0.85))
    body = join_named(
        [
            "Pip_BodyCore",
            "Pip_Belly",
            "Pip_HeadCore",
            "Pip_CheekL",
            "Pip_CheekR",
            "Pip_Neck",
            "Pip_WingArm_L",
            "Pip_WingArm_R",
            "Pip_WingTip_L",
            "Pip_WingTip_R",
        ],
        "Pip_Character",
    )
    voxel_unify(body, 0.011)
    assign_mat(body, body_mat)
    ensure_uv(body)

    # Push shallow eye sockets so eyes sit in the head, not on it.
    for vert in body.data.vertices:
        for sx in (-0.058, 0.058):
            d = (Vector((sx, -0.13, 0.428)) - vert.co).length
            if d < 0.055:
                vert.co.y += 0.012 * (1.0 - d / 0.055)
    body.data.update()

    # Defined chick beak (wedge), not a nub.
    cone("Pip_Beak", 0.028, 0.085, (0.0, -0.214, 0.368), rot=(math.radians(102), 0, 0), verts=20)
    sphere("Pip_BeakBase", 0.022, (0.0, -0.178, 0.370), segs=16, rings=10, scale=(0.95, 0.7, 0.7))
    beak = join_named(["Pip_Beak", "Pip_BeakBase"], "Pip_Beak")
    voxel_unify(beak, 0.008)
    assign_mat(beak, beak_mat)
    ensure_uv(beak)

    sphere("Pip_MouthCavity", 0.018, (0.0, -0.168, 0.355), segs=12, rings=8, scale=(1.1, 0.6, 0.55))
    assign_mat(bpy.data.objects["Pip_MouthCavity"], mouth)
    sphere("Pip_Tongue", 0.010, (0.0, -0.176, 0.350), segs=10, rings=6, scale=(0.8, 1.4, 0.45))
    assign_mat(bpy.data.objects["Pip_Tongue"], tongue)

    for i, (x, z_off, sy) in enumerate(((-0.034, 0.0, 1.35), (0.0, 0.02, 1.9), (0.034, 0.0, 1.35))):
        sphere(f"Pip_Comb_{i}", 0.03, (x, -0.018, 0.555 + z_off), segs=18, rings=12, scale=(0.62, 0.58, sy))
    comb = join_named(["Pip_Comb_0", "Pip_Comb_1", "Pip_Comb_2"], "Pip_Comb")
    voxel_unify(comb, 0.007)
    assign_mat(comb, comb_mat)

    for side, x in (("L", -0.058), ("R", 0.058)):
        s = sphere(f"Pip_EyeWhite_{side}", 0.052, (x, -0.132, 0.428), segs=20, rings=14, scale=(1.05, 0.62, 1.08))
        assign_mat(s, white)
        ir = sphere(f"Pip_Iris_{side}", 0.026, (x, -0.154, 0.428), segs=16, rings=12)
        assign_mat(ir, iris)
        pu = sphere(f"Pip_Pupil_{side}", 0.012, (x, -0.168, 0.428), segs=12, rings=8)
        assign_mat(pu, pupil)
        ca = sphere(f"Pip_Catch_{side}", 0.007, (x - 0.012, -0.174, 0.440), segs=10, rings=6)
        assign_mat(ca, catch)
        br = cylinder(f"Pip_Brow_{side}", 0.006, 0.05, (x, -0.128, 0.488), verts=10, rot=(0, math.radians(90), math.radians(-16 if side == "L" else 16)))
        assign_mat(br, brow_mat)
        lid = sphere(f"Pip_Lid_{side}", 0.054, (x, -0.128, 0.442), segs=16, rings=10, scale=(1.08, 0.35, 0.55))
        assign_mat(lid, body_mat)

    for side, x in (("L", -0.048), ("R", 0.048)):
        lg = cylinder(f"Pip_Leg_{side}", 0.015, 0.12, (x, 0.0, 0.072), verts=12)
        assign_mat(lg, feet_mat)
        pad = sphere(f"Pip_Foot_{side}", 0.026, (x, -0.012, 0.016), segs=12, rings=8, scale=(1.15, 1.4, 0.42))
        assign_mat(pad, feet_mat)
        for ti, (tx, ty) in enumerate(((-0.016, -0.038), (0.0, -0.046), (0.016, -0.038))):
            toe = sphere(f"Pip_Toe_{side}_{ti}", 0.011, (x + tx, ty, 0.011), segs=10, rings=6, scale=(0.85, 1.45, 0.5))
            assign_mat(toe, feet_mat)

    pack = sphere("Pip_Backpack", 0.078, (0.0, 0.128, 0.258), segs=20, rings=14, scale=(1.05, 0.68, 1.12))
    assign_mat(pack, pack_mat)
    pouch = sphere("Pip_Backpack_Pouch", 0.034, (0.078, 0.122, 0.218), segs=14, rings=10, scale=(0.72, 0.62, 0.82))
    assign_mat(pouch, pack_mat)
    for side, x in (("L", -0.06), ("R", 0.06)):
        st = cylinder(f"Pip_Strap_{side}", 0.008, 0.14, (x, 0.04, 0.32), verts=10, rot=(math.radians(55), 0, 0))
        assign_mat(st, strap_mat)
    star = star_mesh("Pip_StarCharm", (0.0, 0.168, 0.312), 0.02, gold_mat)

    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj.name.startswith("Pip_"):
            apply_all(obj)
            smooth(obj)

    groom = feather_cards("Pip", body, body_mat, count=42, seed=11)

    add_shape_keys(body, SHAPE_KEYS)

    def mouth_open(co, i, v):
        if co.z > 0.34 and co.y < -0.04:
            co.z -= 0.018
            co.y -= 0.012
        return co

    def smile(co, i, v):
        if co.z > 0.33 and abs(co.x) > 0.02 and co.y < -0.03:
            co.z += 0.01
        return co

    def blink(co, i, v, side):
        if 0.39 < co.z < 0.48 and co.y < -0.06:
            if (side == "L" and co.x < 0) or (side == "R" and co.x > 0):
                co.z -= 0.012
                co.y += 0.006
        return co

    sculpt_shape_key(body, "jaw_open", mouth_open)
    sculpt_shape_key(body, "viseme_A", mouth_open)
    sculpt_shape_key(body, "mouth_smile", smile)
    sculpt_shape_key(body, "expr_happy", smile)
    sculpt_shape_key(body, "blink_left", lambda c, i, v: blink(c, i, v, "L"))
    sculpt_shape_key(body, "blink_right", lambda c, i, v: blink(c, i, v, "R"))
    sculpt_shape_key(body, "viseme_O", lambda c, i, v: type(c)((c.x * 0.94, c.y - 0.01, c.z - 0.014)) if c.z > 0.34 and c.y < -0.04 else c)
    sculpt_shape_key(body, "viseme_U", lambda c, i, v: type(c)((c.x * 0.9, c.y - 0.01, c.z - 0.01)) if c.z > 0.34 and c.y < -0.04 else c)
    sculpt_shape_key(body, "viseme_MBP", lambda c, i, v: type(c)((c.x, c.y + 0.01, c.z)) if c.z > 0.34 and c.y < -0.06 else c)
    sculpt_shape_key(body, "expr_surprised", mouth_open)
    sculpt_shape_key(body, "cheek_puff", lambda c, i, v: type(c)((c.x * 1.04, c.y, c.z)) if 0.34 < c.z < 0.4 and abs(c.x) > 0.05 else c)

    arm = ensure_armature(
        "Pip_Rig",
        [
            ("root", (0, 0, 0), (0, 0, 0.05), None),
            ("pelvis", (0, 0, 0.12), (0, 0, 0.2), "root"),
            ("spine", (0, 0, 0.2), (0, 0, 0.32), "pelvis"),
            ("chest", (0, 0, 0.32), (0, 0, 0.38), "spine"),
            ("neck", (0, -0.01, 0.38), (0, -0.02, 0.42), "chest"),
            ("head", (0, -0.02, 0.42), (0, -0.04, 0.52), "neck"),
            ("wing_L", (-0.08, 0, 0.26), (-0.20, 0.02, 0.22), "chest"),
            ("wing_R", (0.08, 0, 0.26), (0.20, 0.02, 0.22), "chest"),
            ("leg_L", (-0.05, 0, 0.14), (-0.05, 0, 0.04), "pelvis"),
            ("leg_R", (0.05, 0, 0.14), (0.05, 0, 0.04), "pelvis"),
            ("foot_L", (-0.05, 0, 0.04), (-0.05, -0.04, 0.02), "leg_L"),
            ("foot_R", (0.05, 0, 0.04), (0.05, -0.04, 0.02), "leg_R"),
            ("backpack", (0, 0.1, 0.26), (0, 0.16, 0.26), "chest"),
            ("comb", (0, -0.02, 0.5), (0, -0.02, 0.56), "head"),
            ("eye_L", (-0.058, -0.13, 0.428), (-0.058, -0.18, 0.428), "head"),
            ("eye_R", (0.058, -0.13, 0.428), (0.058, -0.18, 0.428), "head"),
            ("eyelid_L", (-0.058, -0.12, 0.45), (-0.058, -0.12, 0.49), "head"),
            ("eyelid_R", (0.058, -0.12, 0.45), (0.058, -0.12, 0.49), "head"),
        ],
    )
    heat_weights(body, arm)
    if groom:
        parent_armature(groom, arm)
        heat_weights(groom, arm)
    for name, bone in (
        ("Pip_Beak", "head"),
        ("Pip_Comb", "comb"),
        ("Pip_MouthCavity", "head"),
        ("Pip_Tongue", "head"),
        ("Pip_Backpack", "backpack"),
        ("Pip_Backpack_Pouch", "backpack"),
        ("Pip_StarCharm", "backpack"),
        ("Pip_Strap_L", "backpack"),
        ("Pip_Strap_R", "backpack"),
        ("Pip_EyeWhite_L", "eye_L"),
        ("Pip_Iris_L", "eye_L"),
        ("Pip_Pupil_L", "eye_L"),
        ("Pip_Catch_L", "eye_L"),
        ("Pip_Lid_L", "eyelid_L"),
        ("Pip_Brow_L", "head"),
        ("Pip_EyeWhite_R", "eye_R"),
        ("Pip_Iris_R", "eye_R"),
        ("Pip_Pupil_R", "eye_R"),
        ("Pip_Catch_R", "eye_R"),
        ("Pip_Lid_R", "eyelid_R"),
        ("Pip_Brow_R", "head"),
        ("Pip_Leg_L", "leg_L"),
        ("Pip_Foot_L", "foot_L"),
        ("Pip_Toe_L_0", "foot_L"),
        ("Pip_Toe_L_1", "foot_L"),
        ("Pip_Toe_L_2", "foot_L"),
        ("Pip_Leg_R", "leg_R"),
        ("Pip_Foot_R", "foot_R"),
        ("Pip_Toe_R_0", "foot_R"),
        ("Pip_Toe_R_1", "foot_R"),
        ("Pip_Toe_R_2", "foot_R"),
    ):
        if name in bpy.data.objects:
            parent_armature(bpy.data.objects[name], arm)

    body["ddp_character_code"] = "CHAR_PIP_001"
    body["ddp_asset_id"] = "char_pip_theatrical_v1_proposed"
    body["ddp_quality"] = "PROPOSED_THEATRICAL_V1"
    body["ddp_approved"] = False

    def idle(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.05 * math.sin(t * math.pi * 2), 0, 0)
        a.pose.bones["comb"].rotation_euler = (0.08 * math.sin(t * math.pi * 2), 0, 0)
        a.pose.bones["eye_L"].rotation_euler = (0.04 * math.sin(t * math.pi * 2), 0, 0)
        a.pose.bones["eye_R"].rotation_euler = (0.04 * math.sin(t * math.pi * 2), 0, 0)

    def walk(a, f, t):
        s = math.sin(t * math.pi * 2) * 0.45
        a.pose.bones["leg_L"].rotation_euler = (s, 0, 0)
        a.pose.bones["leg_R"].rotation_euler = (-s, 0, 0)
        a.pose.bones["wing_L"].rotation_euler = (0, 0, s * 0.4)
        a.pose.bones["wing_R"].rotation_euler = (0, 0, -s * 0.4)
        a.pose.bones["root"].location = (0, t * 0.8, 0.01 * abs(math.sin(t * math.pi * 2)))

    def point(a, f, t):
        a.pose.bones["wing_R"].rotation_euler = (0.15, -0.75, -0.4)
        a.pose.bones["head"].rotation_euler = (0.05, 0, 0.15)
        a.pose.bones["eye_L"].rotation_euler = (0.0, 0, 0.12)
        a.pose.bones["eye_R"].rotation_euler = (0.0, 0, 0.12)

    def wave(a, f, t):
        a.pose.bones["wing_R"].rotation_euler = (0, 0, -0.9 - 0.35 * math.sin(t * math.pi * 4))
        a.pose.bones["head"].rotation_euler = (0, 0, 0.12)

    inherited = append_canonical_actions(LIB_PIP, "PIP_") if LIB_PIP.exists() else []
    existing = set(inherited)
    if "PIP_IDLE" not in existing:
        add_action(arm, "PIP_IDLE", 24, idle)
    if "PIP_WALK" not in existing:
        add_action(arm, "PIP_WALK", 24, walk)
    if "PIP_POINT" not in existing:
        add_action(arm, "PIP_POINT", 24, point)
    if "PIP_WAVE" not in existing:
        add_action(arm, "PIP_WAVE", 24, wave)

    out = PROPOSED / "pip_theatrical_v1.blend"
    assert_not_production_library(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    return {
        "path": str(out.relative_to(REPO_ROOT)),
        "verts": len(body.data.vertices),
        "polys": len(body.data.polygons),
        "bones": [b.name for b in arm.data.bones],
        "inheritedActions": inherited,
        "label": "proposed theatrical v1",
        "approved": False,
    }


def build_goat():
    reset_scene()
    maps = write_variation_maps("goat_body", GOAT_CREAM)
    body_mat = principled_mat("GoatBody", GOAT_CREAM, roughness=0.5, subsurface=0.26, sheen=0.56)
    attach_image_maps(body_mat, maps["basecolor"], maps["roughness"], maps["normal"])
    horn_mat = principled_mat("GoatHorn", GOAT_HORN, roughness=0.36, coat=0.12, coat_rough=0.28)
    nose_mat = principled_mat("GoatNose", GOAT_NOSE, roughness=0.32, subsurface=0.16, coat=0.08)
    collar_mat = principled_mat("GoatCollar", GOAT_COLLAR, roughness=0.4, sheen=0.2)
    tag_mat = principled_mat("GoatTag", GOAT_TAG, roughness=0.22, metallic=0.45, coat=0.12)
    hoof_mat = principled_mat("GoatHoof", GOAT_HOOF, roughness=0.4, coat=0.06)
    ear_in = principled_mat("GoatEarInner", GOAT_EAR_IN, roughness=0.4, subsurface=0.18, sheen=0.18)
    white = principled_mat("GoatEyeWhite", (0.99, 0.99, 0.99), roughness=0.06, specular=0.72, coat=0.32, coat_rough=0.04)
    iris = principled_mat("GoatIris", GOAT_IRIS, roughness=0.2, coat=0.18)
    pupil = principled_mat("GoatPupil", (0.04, 0.03, 0.03), roughness=0.16)
    catch = principled_mat("GoatCatchlight", (1, 1, 1), roughness=0.05, coat=0.4, emission=0.18)
    brow_mat = principled_mat("GoatBrow", (0.18, 0.10, 0.06), roughness=0.55)
    tongue = principled_mat("GoatTongue", (0.86, 0.32, 0.34), roughness=0.35, subsurface=0.2)
    mouth = principled_mat("GoatMouth", (0.32, 0.08, 0.10), roughness=0.45)

    sphere("Goat_BodyCore", 0.20, (0.0, 0.04, 0.38), segs=32, rings=20, scale=(1.05, 1.25, 0.95))
    sphere("Goat_ChestFluff", 0.12, (0.0, -0.04, 0.42), segs=20, rings=14, scale=(1.15, 0.9, 1.05))
    sphere("Goat_HeadCore", 0.16, (0.0, -0.18, 0.72), segs=32, rings=20, scale=(1.05, 1.08, 1.0))
    sphere("Goat_Muzzle", 0.07, (0.0, -0.30, 0.62), segs=20, rings=14, scale=(0.85, 1.25, 0.75))
    sphere("Goat_CheekL", 0.07, (-0.09, -0.22, 0.66), segs=16, rings=12)
    sphere("Goat_CheekR", 0.07, (0.09, -0.22, 0.66), segs=16, rings=12)
    sphere("Goat_Neck", 0.08, (0.0, -0.06, 0.56), segs=16, rings=12, scale=(1.1, 1.2, 0.9))
    body = join_named(
        ["Goat_BodyCore", "Goat_ChestFluff", "Goat_HeadCore", "Goat_Muzzle", "Goat_CheekL", "Goat_CheekR", "Goat_Neck"],
        "Goat_Character",
    )
    voxel_unify(body, 0.013)
    assign_mat(body, body_mat)
    ensure_uv(body)
    for vert in body.data.vertices:
        for sx in (-0.05, 0.05):
            d = (Vector((sx, -0.30, 0.74)) - vert.co).length
            if d < 0.05:
                vert.co.y += 0.01 * (1.0 - d / 0.05)
    body.data.update()

    # Curved ridged horns
    for side, sx in (("L", -1), ("R", 1)):
        parts = []
        for i in range(5):
            t = i / 4
            x = sx * (0.06 + 0.02 * t)
            y = -0.16 - 0.02 * t
            z = 0.86 + 0.07 * t
            r = 0.022 - 0.003 * i
            p = sphere(f"Goat_Horn_{side}_{i}", r, (x, y, z), segs=12, rings=8)
            parts.append(p.name)
        horn = join_named(parts, f"Goat_Horn_{side}")
        voxel_unify(horn, 0.006)
        assign_mat(horn, horn_mat)

    for side, sx in (("L", -1), ("R", 1)):
        ear = sphere(f"Goat_Ear_{side}", 0.055, (sx * 0.16, -0.12, 0.78), segs=16, rings=12, scale=(0.55, 1.35, 0.85))
        assign_mat(ear, body_mat)
        inn = sphere(f"Goat_EarInner_{side}", 0.04, (sx * 0.16, -0.14, 0.78), segs=12, rings=8, scale=(0.4, 1.2, 0.7))
        assign_mat(inn, ear_in)

    nose = sphere("Goat_Nose", 0.028, (0.0, -0.36, 0.60), segs=14, rings=10, scale=(1.15, 0.7, 0.7))
    assign_mat(nose, nose_mat)
    beard = sphere("Goat_Beard", 0.03, (0.0, -0.32, 0.54), segs=12, rings=8, scale=(0.6, 0.8, 1.3))
    assign_mat(beard, body_mat)
    cavity = sphere("Goat_MouthCavity", 0.02, (0.0, -0.33, 0.58), segs=10, rings=6, scale=(1.0, 0.55, 0.5))
    assign_mat(cavity, mouth)
    tong = sphere("Goat_Tongue", 0.012, (0.0, -0.34, 0.575), segs=10, rings=6, scale=(0.7, 1.3, 0.4))
    assign_mat(tong, tongue)

    for side, x in (("L", -0.05), ("R", 0.05)):
        s = sphere(f"Goat_EyeWhite_{side}", 0.048, (x, -0.30, 0.74), segs=18, rings=12, scale=(1.05, 0.7, 1.05))
        assign_mat(s, white)
        ir = sphere(f"Goat_Iris_{side}", 0.024, (x, -0.322, 0.74), segs=14, rings=10)
        assign_mat(ir, iris)
        pu = sphere(f"Goat_Pupil_{side}", 0.011, (x, -0.334, 0.74), segs=10, rings=6)
        assign_mat(pu, pupil)
        ca = sphere(f"Goat_Catch_{side}", 0.007, (x - 0.01, -0.338, 0.752), segs=8, rings=6)
        assign_mat(ca, catch)
        br = cylinder(f"Goat_Brow_{side}", 0.005, 0.045, (x, -0.292, 0.792), verts=8, rot=(0, math.radians(90), 0))
        assign_mat(br, brow_mat)
        lid = sphere(f"Goat_Lid_{side}", 0.05, (x, -0.296, 0.752), segs=14, rings=8, scale=(1.05, 0.32, 0.5))
        assign_mat(lid, body_mat)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.15, minor_radius=0.022, location=(0, -0.18, 0.66), major_segments=40, minor_segments=14)
    collar = bpy.context.object
    collar.name = "Goat_Collar"
    assign_mat(collar, collar_mat)
    tag = cylinder("Goat_Tag", 0.028, 0.006, (0.0, -0.30, 0.60), verts=16, rot=(math.radians(90), 0, 0))
    assign_mat(tag, tag_mat)

    for name, loc in (
        ("Goat_Leg_FL", (-0.08, -0.10, 0.16)),
        ("Goat_Leg_FR", (0.08, -0.10, 0.16)),
        ("Goat_Leg_BL", (-0.08, 0.16, 0.16)),
        ("Goat_Leg_BR", (0.08, 0.16, 0.16)),
    ):
        lg = cylinder(name, 0.022, 0.28, loc, verts=12)
        assign_mat(lg, body_mat)
        hx, hy = loc[0], loc[1]
        hoof = sphere(name.replace("Leg", "Hoof"), 0.028, (hx, hy, 0.02), segs=12, rings=8, scale=(1.0, 1.15, 0.45))
        assign_mat(hoof, hoof_mat)

    tail = sphere("Goat_Tail", 0.04, (0.0, 0.28, 0.42), segs=12, rings=8, scale=(0.7, 1.2, 0.7))
    assign_mat(tail, body_mat)

    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj.name.startswith("Goat_"):
            apply_all(obj)
            smooth(obj)

    groom = feather_cards("Goat", body, body_mat, count=56, length=0.028, seed=19)

    add_shape_keys(body, SHAPE_KEYS)
    sculpt_shape_key(body, "jaw_open", lambda c, i, v: type(c)((c.x, c.y - 0.012, c.z - 0.01)) if c.z > 0.58 and c.y < -0.2 else c)
    sculpt_shape_key(body, "mouth_smile", lambda c, i, v: type(c)((c.x, c.y, c.z + 0.008)) if c.z > 0.58 and abs(c.x) > 0.03 and c.y < -0.18 else c)
    sculpt_shape_key(body, "expr_happy", lambda c, i, v: type(c)((c.x, c.y, c.z + 0.008)) if c.z > 0.58 and abs(c.x) > 0.03 and c.y < -0.18 else c)
    sculpt_shape_key(body, "viseme_A", lambda c, i, v: type(c)((c.x, c.y - 0.012, c.z - 0.01)) if c.z > 0.58 and c.y < -0.2 else c)
    sculpt_shape_key(body, "blink_left", lambda c, i, v: type(c)((c.x, c.y + 0.006, c.z - 0.01)) if 0.7 < c.z < 0.8 and c.x < 0 and c.y < -0.22 else c)
    sculpt_shape_key(body, "blink_right", lambda c, i, v: type(c)((c.x, c.y + 0.006, c.z - 0.01)) if 0.7 < c.z < 0.8 and c.x > 0 and c.y < -0.22 else c)

    arm = ensure_armature(
        "Goat_Rig",
        [
            ("root", (0, 0, 0), (0, 0, 0.08), None),
            ("pelvis", (0, 0.04, 0.32), (0, 0.02, 0.42), "root"),
            ("spine", (0, 0.0, 0.42), (0, -0.04, 0.54), "pelvis"),
            ("chest", (0, -0.04, 0.54), (0, -0.08, 0.62), "spine"),
            ("neck", (0, -0.08, 0.62), (0, -0.14, 0.70), "chest"),
            ("head", (0, -0.16, 0.72), (0, -0.22, 0.84), "neck"),
            ("ear_L", (-0.12, -0.14, 0.78), (-0.20, -0.10, 0.80), "head"),
            ("ear_R", (0.12, -0.14, 0.78), (0.20, -0.10, 0.80), "head"),
            ("leg_FL", (-0.08, -0.10, 0.30), (-0.08, -0.10, 0.08), "pelvis"),
            ("leg_FR", (0.08, -0.10, 0.30), (0.08, -0.10, 0.08), "pelvis"),
            ("leg_BL", (-0.08, 0.16, 0.30), (-0.08, 0.16, 0.08), "pelvis"),
            ("leg_BR", (0.08, 0.16, 0.30), (0.08, 0.16, 0.08), "pelvis"),
            ("hoof_FL", (-0.08, -0.10, 0.08), (-0.08, -0.10, 0.02), "leg_FL"),
            ("hoof_FR", (0.08, -0.10, 0.08), (0.08, -0.10, 0.02), "leg_FR"),
            ("hoof_BL", (-0.08, 0.16, 0.08), (-0.08, 0.16, 0.02), "leg_BL"),
            ("hoof_BR", (0.08, 0.16, 0.08), (0.08, 0.16, 0.02), "leg_BR"),
            ("tail", (0, 0.22, 0.42), (0, 0.30, 0.40), "pelvis"),
            ("collar", (0, -0.18, 0.66), (0, -0.22, 0.66), "neck"),
            ("eye_L", (-0.05, -0.30, 0.74), (-0.05, -0.36, 0.74), "head"),
            ("eye_R", (0.05, -0.30, 0.74), (0.05, -0.36, 0.74), "head"),
            ("eyelid_L", (-0.05, -0.29, 0.76), (-0.05, -0.29, 0.80), "head"),
            ("eyelid_R", (0.05, -0.29, 0.76), (0.05, -0.29, 0.80), "head"),
        ],
    )
    heat_weights(body, arm)
    if groom:
        parent_armature(groom, arm)
        heat_weights(groom, arm)
    for name, bone in (
        ("Goat_Horn_L", "head"),
        ("Goat_Horn_R", "head"),
        ("Goat_Ear_L", "ear_L"),
        ("Goat_Ear_R", "ear_R"),
        ("Goat_EarInner_L", "ear_L"),
        ("Goat_EarInner_R", "ear_R"),
        ("Goat_Nose", "head"),
        ("Goat_Beard", "head"),
        ("Goat_MouthCavity", "head"),
        ("Goat_Tongue", "head"),
        ("Goat_Collar", "collar"),
        ("Goat_Tag", "collar"),
        ("Goat_Tail", "tail"),
        ("Goat_EyeWhite_L", "eye_L"),
        ("Goat_Iris_L", "eye_L"),
        ("Goat_Pupil_L", "eye_L"),
        ("Goat_Catch_L", "eye_L"),
        ("Goat_Lid_L", "eyelid_L"),
        ("Goat_EyeWhite_R", "eye_R"),
        ("Goat_Iris_R", "eye_R"),
        ("Goat_Pupil_R", "eye_R"),
        ("Goat_Catch_R", "eye_R"),
        ("Goat_Lid_R", "eyelid_R"),
        ("Goat_Brow_L", "head"),
        ("Goat_Brow_R", "head"),
        ("Goat_Leg_FL", "leg_FL"),
        ("Goat_Leg_FR", "leg_FR"),
        ("Goat_Leg_BL", "leg_BL"),
        ("Goat_Leg_BR", "leg_BR"),
        ("Goat_Hoof_FL", "hoof_FL"),
        ("Goat_Hoof_FR", "hoof_FR"),
        ("Goat_Hoof_BL", "hoof_BL"),
        ("Goat_Hoof_BR", "hoof_BR"),
    ):
        if name in bpy.data.objects:
            parent_armature(bpy.data.objects[name], arm)

    body["ddp_character_code"] = "CHAR_GOAT_001"
    body["ddp_asset_id"] = "char_goat_theatrical_v1_proposed"
    body["ddp_approved"] = False

    def idle(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.04 * math.sin(t * math.pi * 2), 0, 0)
        a.pose.bones["tail"].rotation_euler = (0, 0, 0.2 * math.sin(t * math.pi * 2))
        a.pose.bones["ear_L"].rotation_euler = (0, 0.06 * math.sin(t * math.pi * 2), 0)
        a.pose.bones["ear_R"].rotation_euler = (0, -0.06 * math.sin(t * math.pi * 2), 0)

    def nod(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.28 * math.sin(t * math.pi * 2), 0, 0)
        a.pose.bones["eye_L"].rotation_euler = (0.08, 0, 0)
        a.pose.bones["eye_R"].rotation_euler = (0.08, 0, 0)

    def walk(a, f, t):
        s = math.sin(t * math.pi * 2) * 0.4
        a.pose.bones["leg_FL"].rotation_euler = (s, 0, 0)
        a.pose.bones["leg_BR"].rotation_euler = (s, 0, 0)
        a.pose.bones["leg_FR"].rotation_euler = (-s, 0, 0)
        a.pose.bones["leg_BL"].rotation_euler = (-s, 0, 0)

    inherited = append_canonical_actions(LIB_GOAT, "GOAT_") if LIB_GOAT.exists() else []
    existing = set(inherited)
    if "GOAT_IDLE" not in existing:
        add_action(arm, "GOAT_IDLE", 24, idle)
    if "GOAT_HEAD_NOD" not in existing:
        add_action(arm, "GOAT_HEAD_NOD", 24, nod)
    if "GOAT_WALK" not in existing:
        add_action(arm, "GOAT_WALK", 24, walk)

    out = PROPOSED / "goat_theatrical_v1.blend"
    assert_not_production_library(out)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    return {
        "path": str(out.relative_to(REPO_ROOT)),
        "verts": len(body.data.vertices),
        "polys": len(body.data.polygons),
        "bones": [b.name for b in arm.data.bones],
        "inheritedActions": inherited,
        "label": "proposed theatrical v1",
        "approved": False,
    }


def _terrain(name, size, cuts, height_fn):
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=cuts, y_subdivisions=cuts, size=size, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    for vert in obj.data.vertices:
        vert.co.z = height_fn(vert.co.x, vert.co.y)
    obj.data.update()
    smooth(obj)
    return obj


def build_meadow():
    reset_scene()
    maps = write_variation_maps("meadow_grass", (0.28, 0.52, 0.18), size=2048)
    grass = principled_mat("MeadowGrass", (0.28, 0.52, 0.18), roughness=0.62, sheen=0.16)
    attach_image_maps(grass, maps["basecolor"], maps["roughness"], maps["normal"])
    path_mat = principled_mat("MeadowPath", (0.72, 0.62, 0.42), roughness=0.72, sheen=0.04)
    bark = principled_mat("TreeBark", (0.34, 0.20, 0.10), roughness=0.7)
    leaf = principled_mat("TreeLeaf", (0.22, 0.50, 0.18), roughness=0.55, sheen=0.2)
    flower_a = principled_mat("FlowerA", (0.95, 0.45, 0.70), roughness=0.4, sheen=0.15)
    flower_b = principled_mat("FlowerB", (0.95, 0.85, 0.25), roughness=0.4, sheen=0.15)
    rock = principled_mat("MeadowRock", (0.45, 0.42, 0.38), roughness=0.7)
    sky = principled_mat("Sky", (0.55, 0.78, 0.95), roughness=1.0)

    def h(x, y):
        r = math.hypot(x, y)
        path = abs(x * 0.15 + y)
        mound = 0.18 * math.sin(x * 0.35) * math.cos(y * 0.28)
        dip = -0.04 if path < 1.1 else 0.0
        edge = 0.08 * max(0.0, (r - 10) / 6)
        return mound + dip + edge

    ground = _terrain("Meadow_Ground", 24, 64, h)
    assign_mat(ground, grass)
    ensure_uv(ground)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.2, 0, 0.03))
    path = bpy.context.object
    path.name = "Meadow_Path"
    path.scale = (1.15, 11.0, 0.04)
    apply_all(path)
    assign_mat(path, path_mat)
    ensure_uv(path)

    flowers = []
    for i in range(20):
        ang = i * 0.7
        r = 2.2 + (i % 5) * 0.7
        x, y = math.cos(ang) * r, math.sin(ang) * r
        if abs(x * 0.15 + y) < 1.0:
            continue
        fl = sphere(f"Meadow_Flower_{i}", 0.09, (x, y, 0.16 + h(x, y)), segs=10, rings=6)
        assign_mat(fl, flower_a if i % 2 == 0 else flower_b)
        flowers.append(fl.name)
    if flowers:
        join_named(flowers, "Meadow_Flowers")

    trees = []
    for i, (x, y) in enumerate(((-5.2, 4.1), (5.4, 5.0), (-6.1, -3.2), (6.0, -2.4), (-3.2, 7.1), (4.4, -6.0))):
        z = h(x, y)
        tr = cylinder(f"Meadow_Trunk_{i}", 0.16 + 0.02 * (i % 3), 1.6, (x, y, z + 0.8), verts=12)
        assign_mat(tr, bark)
        trees.append(tr.name)
        can = sphere(f"Meadow_Canopy_{i}", 0.85 + 0.08 * (i % 2), (x, y, z + 1.85), segs=16, rings=10, scale=(1.15, 1.1, 0.9))
        assign_mat(can, leaf)
        trees.append(can.name)
    join_named(trees, "Meadow_Trees")

    rocks = []
    for i, (x, y, s) in enumerate(((-1.8, 2.4, 0.22), (2.1, -1.6, 0.18), (-3.4, -1.1, 0.28))):
        rk = sphere(f"Meadow_Rock_{i}", s, (x, y, h(x, y) + s * 0.4), segs=10, rings=6, scale=(1.3, 1.1, 0.7))
        assign_mat(rk, rock)
        rocks.append(rk.name)
    join_named(rocks, "Meadow_Rocks")

    bpy.ops.mesh.primitive_uv_sphere_add(radius=42, location=(0, 0, 0), segments=24, ring_count=12)
    dome = bpy.context.object
    dome.name = "Meadow_Sky"
    dome.scale = (-1, 1, 0.55)
    assign_mat(dome, sky)

    for name, loc in (("Meadow_Stage_Pip", (-0.35, 0.2, 0.02)), ("Meadow_Stage_Goat", (0.45, 0.35, 0.02)), ("Meadow_PropClear", (0.0, -1.4, 0.02))):
        empty = bpy.data.objects.new(name, None)
        empty.location = loc
        empty.empty_display_type = "PLAIN_AXES"
        link(empty)

    out = PROPOSED / "meadow_theatrical_v1.blend"
    assert_not_production_library(out)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    return {"path": str(out.relative_to(REPO_ROOT)), "groundVerts": len(ground.data.vertices), "approved": False, "label": "proposed theatrical v1"}


def build_creek():
    reset_scene()
    bank = principled_mat("CreekBank", (0.36, 0.48, 0.22), roughness=0.65, sheen=0.12)
    sand = principled_mat("CreekSand", (0.70, 0.62, 0.42), roughness=0.7)
    water = principled_mat("CreekWater", (0.35, 0.62, 0.72), roughness=0.08, coat=0.35, coat_rough=0.05)
    if water.use_nodes:
        bsdf = water.node_tree.nodes.get("Principled BSDF")
        if bsdf and "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = 0.55
        water.blend_method = "BLEND"
    rock = principled_mat("CreekRock", (0.42, 0.40, 0.36), roughness=0.68)
    leaf = principled_mat("CreekLeaf", (0.20, 0.48, 0.18), roughness=0.55, sheen=0.18)
    bark = principled_mat("CreekBark", (0.32, 0.18, 0.10), roughness=0.72)

    def h(x, y):
        channel = abs(x)
        bed = -0.16 if channel < 1.15 else 0.0
        bank_h = 0.22 * max(0.0, min(1.0, (channel - 1.1) / 1.4))
        return bed + bank_h + 0.05 * math.sin(y * 0.4)

    ground = _terrain("Creek_Ground", 18, 56, h)
    assign_mat(ground, bank)
    ensure_uv(ground)

    bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, -0.06))
    water_obj = bpy.context.object
    water_obj.name = "Creek_Water"
    water_obj.scale = (0.18, 1.0, 1.0)
    apply_all(water_obj)
    assign_mat(water_obj, water)
    ensure_uv(water_obj)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.12))
    bed = bpy.context.object
    bed.name = "Creek_Bed"
    bed.scale = (1.1, 8.5, 0.05)
    apply_all(bed)
    assign_mat(bed, sand)

    stones = []
    for i, (x, y, s) in enumerate(((0.15, -1.2, 0.16), (-0.1, 0.1, 0.14), (0.2, 1.4, 0.15), (-1.6, 0.8, 0.22), (1.7, -0.6, 0.2))):
        st = sphere(f"Creek_Stone_{i}", s, (x, y, h(x, y) + s * 0.25), segs=10, rings=6, scale=(1.2, 1.1, 0.65))
        assign_mat(st, rock)
        stones.append(st.name)
    join_named(stones, "Creek_Rocks")

    reeds = []
    for i in range(10):
        x = -1.5 if i % 2 == 0 else 1.5
        y = -3 + i * 0.7
        rd = cylinder(f"Creek_Reed_{i}", 0.02, 0.55, (x, y, 0.2), verts=6)
        assign_mat(rd, leaf)
        reeds.append(rd.name)
    join_named(reeds, "Creek_Reeds")

    tr = cylinder("Creek_Trunk", 0.18, 1.5, (-3.2, 2.4, 0.7), verts=12)
    assign_mat(tr, bark)
    can = sphere("Creek_Canopy", 0.9, (-3.2, 2.4, 1.7), segs=14, rings=10)
    assign_mat(can, leaf)

    for name, loc in (("Creek_Stage_Pip", (-1.15, 0.1, 0.12)), ("Creek_Stage_Goat", (1.2, 0.25, 0.12)), ("Creek_Step", (0.15, -1.2, 0.08))):
        empty = bpy.data.objects.new(name, None)
        empty.location = loc
        link(empty)

    out = PROPOSED / "creek_theatrical_v1.blend"
    assert_not_production_library(out)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    return {"path": str(out.relative_to(REPO_ROOT)), "groundVerts": len(ground.data.vertices), "approved": False, "label": "proposed theatrical v1"}


def build_map():
    reset_scene()
    paper_maps = write_variation_maps("map_paper", (0.90, 0.84, 0.70), size=2048)
    paper = principled_mat("MapPaper", (0.90, 0.84, 0.70), roughness=0.68, sheen=0.08)
    attach_image_maps(paper, paper_maps["basecolor"], paper_maps["roughness"], paper_maps["normal"])
    ink = principled_mat("MapInk", (0.18, 0.10, 0.08), roughness=0.42, coat=0.04)
    trail = principled_mat("MapTrail", (0.72, 0.18, 0.14), roughness=0.4)
    water = principled_mat("MapWater", (0.40, 0.62, 0.78), roughness=0.14, coat=0.2)
    land = principled_mat("MapLand", (0.45, 0.62, 0.32), roughness=0.55)
    gold = principled_mat("MapAccent", (0.92, 0.74, 0.22), roughness=0.3, metallic=0.2)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.008))
    sheet = bpy.context.object
    sheet.name = "Map_Sheet"
    sheet.scale = (0.55, 0.38, 0.012)
    apply_all(sheet)
    # Fold memory / curl
    for vert in sheet.data.vertices:
        vert.co.z += 0.012 * math.sin(vert.co.x * 8) * 0.35 + 0.01 * (vert.co.x**2)
    sheet.data.update()
    assign_mat(sheet, paper)
    ensure_uv(sheet)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.08, minor_radius=0.006, location=(-0.18, 0.12, 0.03), major_segments=16, minor_segments=8)
    compass = bpy.context.object
    compass.name = "Map_Compass"
    assign_mat(compass, gold)

    bpy.ops.mesh.primitive_cylinder_add(radius=0.012, depth=0.002, location=(0.18, 0.10, 0.03), vertices=4)
    mark = bpy.context.object
    mark.name = "Map_X"
    mark.rotation_euler = (0, 0, math.radians(45))
    assign_mat(mark, trail)

    bpy.ops.mesh.primitive_cube_add(size=0.2, location=(0.0, -0.02, 0.025))
    route = bpy.context.object
    route.name = "Map_Route"
    route.scale = (1.6, 0.04, 0.02)
    apply_all(route)
    assign_mat(route, trail)

    bpy.ops.mesh.primitive_circle_add(radius=0.07, fill_type="NGON", location=(-0.08, -0.08, 0.028), vertices=8)
    forest = bpy.context.object
    forest.name = "Map_Forest"
    assign_mat(forest, land)

    bpy.ops.mesh.primitive_plane_add(size=0.12, location=(0.16, -0.12, 0.028))
    pond = bpy.context.object
    pond.name = "Map_Water"
    assign_mat(pond, water)

    for obj in list(bpy.data.objects):
        if obj.type == "MESH":
            smooth(obj)

    empty = bpy.data.objects.new("Map_HoldClearance", None)
    empty.location = (0, 0, 0.08)
    link(empty)

    out = PROPOSED / "map_theatrical_v1.blend"
    assert_not_production_library(out)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    return {"path": str(out.relative_to(REPO_ROOT)), "approved": False, "label": "proposed theatrical v1"}


def build_vfx_and_lighting():
    reset_scene()
    spark = principled_mat("VfxSparkle", (1.0, 0.92, 0.55), roughness=0.2, emission=1.4)
    pollen = principled_mat("VfxPollen", (0.95, 0.85, 0.35), roughness=0.4, emission=0.25)
    dust = principled_mat("VfxDust", (0.85, 0.80, 0.70), roughness=0.8)
    mist = principled_mat("VfxMist", (0.75, 0.85, 0.90), roughness=1.0)
    if mist.use_nodes:
        mist.blend_method = "BLEND"
        bsdf = mist.node_tree.nodes.get("Principled BSDF")
        if bsdf and "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = 0.25
    trail = principled_mat("VfxTrail", (0.65, 0.85, 1.0), roughness=0.3, emission=0.6)

    rng_positions = [
        ("Vfx_Dust", dust, 18, 0.012, 3),
        ("Vfx_Pollen", pollen, 14, 0.01, 5),
        ("Vfx_Sparkle", spark, 10, 0.008, 7),
        ("Vfx_Mist", mist, 8, 0.05, 11),
        ("Vfx_Trail", trail, 12, 0.007, 13),
    ]
    for name, mat, count, radius, seed in rng_positions:
        import random

        rng = random.Random(seed)
        parts = []
        for i in range(count):
            loc = (rng.uniform(-0.6, 0.6), rng.uniform(-0.4, 0.4), rng.uniform(0.1, 0.9))
            p = sphere(f"{name}_{i}", radius, loc, segs=8, rings=4)
            assign_mat(p, mat)
            p.hide_render = False
            parts.append(p.name)
        joined = join_named(parts, name)
        joined["ddp_vfx"] = name
        joined["ddp_seeded"] = True
        joined["ddp_cast_shadow"] = False
        for obj in [joined]:
            obj.visible_shadow = False

    # Character-safe motivated add-on lights (NOT LIGHTING_STATES).
    bpy.ops.object.light_add(type="AREA", location=(0.15, -0.55, 0.55))
    eye = bpy.context.object
    eye.name = "Light_EyeCatch"
    eye.data.energy = 18
    eye.data.size = 0.12
    eye.data.use_shadow = False
    bpy.ops.object.light_add(type="AREA", location=(-1.6, -0.4, 1.4))
    fill = bpy.context.object
    fill.name = "Light_ForestFill"
    fill.data.energy = 12
    fill.data.size = 2.4
    fill.data.use_shadow = False
    bpy.ops.object.light_add(type="AREA", location=(0.0, 1.2, 0.35))
    atmos = bpy.context.object
    atmos.name = "Light_MeadowAtmosphere"
    atmos.data.energy = 8
    atmos.data.size = 3.0
    atmos.data.use_shadow = False

    out = PROPOSED / "lighting_vfx_theatrical_v1.blend"
    assert_not_production_library(out)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    return {
        "path": str(out.relative_to(REPO_ROOT)),
        "approved": False,
        "label": "proposed theatrical v1",
        "retunesLightingStates": False,
    }


def main() -> int:
    PROPOSED.mkdir(parents=True, exist_ok=True)
    report = {
        "label": "proposed theatrical v1",
        "approved": False,
        "productionLibraryMutated": False,
        "pip": build_pip(),
        "goat": build_goat(),
        "meadow": build_meadow(),
        "creek": build_creek(),
        "map": build_map(),
        "lightingVfx": build_vfx_and_lighting(),
    }
    out = PROPOSED / "BUILD_MANIFEST.json"
    assert_not_production_library(out)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": "OK", "approved": False, "out": str(out)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
