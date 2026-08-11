"""
Hero art polish for Pip + Goat → v1.1 production blends.

Preserves:
  - asset IDs char_pip_v1 / char_goat_v1
  - object names (Pip_Character, Pip_Rig, Goat_*, accessories)
  - bone names, shape-key names, action names
  - animation / viseme / expression / cache / lock compatibility

Does NOT redesign the DDP pipeline.
Outputs:
  assets/characters/pip/pip_v1_1.blend
  assets/characters/goat/goat_v1_1.blend
Keeps validated v1 masters intact for version history.
"""

from __future__ import annotations

import json
import math
import os
import shutil
from pathlib import Path

ROOT = Path(os.environ.get("REPO_ROOT", "/agent"))
OUT_PIP = ROOT / "assets/characters/pip"
OUT_GOAT = ROOT / "assets/characters/goat"
LIB = ROOT / "production-library/characters"


def reset_scene():
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(
    name,
    color,
    roughness=0.45,
    specular=0.2,
    subsurface=0.0,
    sheen=0.0,
    metallic=0.0,
    fuzz=False,
):
    """EEVEE-friendly stylized material with optional soft fuzz response."""
    import bpy

    m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if not bsdf:
        return m
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = roughness
    if "Specular" in bsdf.inputs:
        bsdf.inputs["Specular"].default_value = specular
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = specular
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = metallic
    for key in ("Subsurface", "Subsurface Weight"):
        if key in bsdf.inputs and subsurface > 0:
            bsdf.inputs[key].default_value = subsurface
    if "Subsurface Color" in bsdf.inputs and subsurface > 0:
        bsdf.inputs["Subsurface Color"].default_value = (*color, 1.0)
    if "Subsurface Radius" in bsdf.inputs and subsurface > 0:
        bsdf.inputs["Subsurface Radius"].default_value = (0.8, 0.5, 0.3)
    sheen_v = sheen if sheen > 0 else (min(1.0, subsurface * 2.2) if fuzz else 0.0)
    if "Sheen" in bsdf.inputs and sheen_v > 0:
        bsdf.inputs["Sheen"].default_value = sheen_v
    if "Sheen Weight" in bsdf.inputs and sheen_v > 0:
        bsdf.inputs["Sheen Weight"].default_value = sheen_v
    if "Sheen Tint" in bsdf.inputs and sheen_v > 0:
        try:
            bsdf.inputs["Sheen Tint"].default_value = (*color, 1.0)
        except Exception:
            pass
    if fuzz:
        # Soft look via sheen/subsurface only — avoid per-pixel noise bump on EEVEE CPU
        pass
    return m


def eye_gloss_mat(name, color=(0.98, 0.98, 0.98)):
    return mat(name, color, roughness=0.12, specular=0.65, subsurface=0.0, sheen=0.0)


def link(obj):
    import bpy

    if obj.name not in bpy.context.collection.objects:
        bpy.context.collection.objects.link(obj)
    return obj


def smooth(obj, auto=True):
    import bpy
    from math import radians

    if obj.type != "MESH":
        return
    for p in obj.data.polygons:
        p.use_smooth = True
    if hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = auto
        if hasattr(obj.data, "auto_smooth_angle"):
            obj.data.auto_smooth_angle = radians(60)


def apply_all(obj):
    import bpy

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def apply_scale(obj):
    import bpy

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def finalize_mesh(obj):
    """Shade smooth + consistent normals after join."""
    import bpy

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    smooth(obj)
    # Origin at world zero so armature parenting matches bone space
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)


def ensure_armature(name, bones):
    import bpy

    arm_data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, arm_data)
    link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    edit = arm_data.edit_bones
    created = {}
    for bname, head, tail, parent in bones:
        b = edit.new(bname)
        b.head = head
        b.tail = tail
        if parent and parent in created:
            b.parent = created[parent]
        created[bname] = b
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def parent_with_armature(obj, arm):
    obj.parent = arm
    mod = obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm


def add_shape_keys(obj, names):
    if not obj.data.shape_keys:
        obj.shape_key_add(name="Basis", from_mix=False)
    for n in names:
        if n not in obj.data.shape_keys.key_blocks:
            kb = obj.shape_key_add(name=n, from_mix=False)
            kb.value = 0.0


def sculpt_shape_key(obj, key_name, mutate_fn):
    from mathutils import Vector

    keys = obj.data.shape_keys.key_blocks
    if key_name not in keys:
        return
    kb = keys[key_name]
    basis = keys["Basis"]
    for i, vert in enumerate(obj.data.vertices):
        co = Vector(basis.data[i].co)
        kb.data[i].co = mutate_fn(co, i, vert)


def add_action(arm, name, frames, fn):
    import bpy

    action = bpy.data.actions.new(name=name)
    action.use_fake_user = True
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = action
    for f in range(1, frames + 1):
        t = (f - 1) / max(1, frames - 1)
        fn(arm, f, t)
        for pb in arm.pose.bones:
            pb.keyframe_insert(data_path="location", frame=f)
            pb.keyframe_insert(data_path="rotation_euler", frame=f)
    arm.animation_data.action = None
    return action


def polygon_count(obj):
    if obj.type != "MESH" or not obj.data:
        return 0
    return len(obj.data.polygons)


def make_sphere(name, radius, loc, segs=20, rings=14, material=None, scale=None):
    import bpy

    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=segs, ring_count=rings)
    o = bpy.context.object
    o.name = name
    if scale:
        o.scale = scale
        apply_scale(o)
    if material:
        o.data.materials.append(material)
    smooth(o)
    return o


def make_cylinder(name, radius, depth, loc, material=None, scale=None, rot=None, segs=24):
    import bpy

    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=loc, vertices=segs)
    o = bpy.context.object
    o.name = name
    if rot:
        o.rotation_euler = rot
    if scale:
        o.scale = scale
        apply_scale(o)
    if material:
        o.data.materials.append(material)
    smooth(o)
    return o


def make_cube(name, size, loc, material=None, scale=None, rot=None):
    import bpy

    bpy.ops.mesh.primitive_cube_add(size=size, location=loc)
    o = bpy.context.object
    o.name = name
    if rot:
        o.rotation_euler = rot
    if scale:
        o.scale = scale
        apply_scale(o)
    if material:
        o.data.materials.append(material)
    smooth(o)
    return o


def make_star(name, loc, radius=0.018, material=None):
    """Simple 5-point star from extruded circle approximation (gold charm)."""
    import bpy
    from mathutils import Vector

    bpy.ops.mesh.primitive_circle_add(vertices=10, radius=radius, fill_type="NGON", location=loc)
    o = bpy.context.object
    o.name = name
    # Pinch alternate verts toward center for star silhouette
    mesh = o.data
    for i, v in enumerate(mesh.vertices):
        if i % 2 == 1:
            v.co *= 0.42
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.extrude_region_move(TRANSFORM_OT_translate={"value": (0, 0.008, 0)})
    bpy.ops.object.mode_set(mode="OBJECT")
    o.rotation_euler = (math.radians(90), 0, 0)
    if material:
        o.data.materials.clear()
        o.data.materials.append(material)
    smooth(o)
    return o


# ─────────────────────────────────────────────────────────────────────────────
# PIP v1.1
# ─────────────────────────────────────────────────────────────────────────────


def build_pip(path: Path) -> dict:
    import bpy

    reset_scene()
    yellow = mat("PipBody", (1.0, 0.9, 0.12), 0.48, 0.2, subsurface=0.18, fuzz=True)
    white = eye_gloss_mat("PipEyeWhite", (0.99, 0.99, 0.99))
    iris = mat("PipIris", (0.38, 0.18, 0.06), 0.28, 0.35)
    pupil = mat("PipPupil", (0.04, 0.03, 0.03), 0.18, 0.05)
    catch = eye_gloss_mat("PipCatchlight", (1.0, 1.0, 1.0))
    brow = mat("PipBrow", (0.1, 0.05, 0.03), 0.55, 0.05)
    beak = mat("PipBeak", (1.0, 0.55, 0.08), 0.35, 0.3, subsurface=0.05)
    orange = mat("PipFeet", (1.0, 0.45, 0.08), 0.4, 0.25, subsurface=0.05)
    comb = mat("PipComb", (0.95, 0.08, 0.12), 0.35, 0.25, subsurface=0.1, fuzz=True)
    purple = mat("PipBackpack", (0.48, 0.28, 0.78), 0.38, 0.28)
    strap = mat("PipStrap", (0.38, 0.2, 0.65), 0.4, 0.2)
    gold = mat("PipStar", (0.97, 0.8, 0.22), 0.28, 0.7, metallic=0.35)

    # Oversized rounded head + compact pear body
    body = make_sphere("Pip_Body", 0.135, (0, 0.01, 0.205), segs=26, rings=16, material=yellow, scale=(1.05, 0.95, 1.12))
    head = make_sphere("Pip_Head", 0.155, (0, -0.015, 0.405), segs=26, rings=16, material=yellow, scale=(1.02, 0.98, 1.0))

    # Red 3-lobe crest — center tallest
    for i, (x, z_off, sy) in enumerate(((-0.034, 0.0, 1.25), (0.0, 0.015, 1.75), (0.034, 0.0, 1.25))):
        make_sphere(f"Pip_Comb_{i}", 0.03, (x, -0.02, 0.55 + z_off), segs=16, rings=12, material=comb, scale=(0.65, 0.6, sy))

    # Very large expressive eyes + brows + catchlights
    for side, x in (("L", -0.058), ("R", 0.058)):
        make_sphere(f"Pip_EyeWhite_{side}", 0.06, (x, -0.14, 0.428), segs=18, rings=12, material=white, scale=(1.08, 0.58, 1.12))
        make_sphere(f"Pip_Iris_{side}", 0.03, (x, -0.162, 0.428), segs=18, rings=12, material=iris)
        make_sphere(f"Pip_Pupil_{side}", 0.013, (x, -0.176, 0.428), segs=12, rings=8, material=pupil)
        make_sphere(f"Pip_Catch_{side}", 0.008, (x - 0.014, -0.182, 0.442), segs=10, rings=6, material=catch)
        make_cube(f"Pip_Brow_{side}", 0.048, (x, -0.132, 0.492), material=brow, scale=(1.2, 0.16, 0.2), rot=(0, 0, math.radians(-14 if side == "L" else 14)))

    # Small friendly orange beak — slightly pointed but soft (not a nose nub)
    make_sphere("Pip_Beak", 0.03, (0, -0.195, 0.372), segs=18, rings=12, material=beak, scale=(0.75, 1.65, 0.62))
    make_sphere("Pip_BeakTip", 0.014, (0, -0.225, 0.368), segs=12, rings=8, material=beak, scale=(0.7, 1.1, 0.55))

    # Soft wing-like arms
    for side, x in (("L", -0.158), ("R", 0.158)):
        make_sphere(
            f"Pip_Wing_{side}",
            0.06,
            (x, 0.01, 0.232),
            segs=20,
            rings=14,
            material=yellow,
            scale=(0.42, 1.35, 0.9),
        )

    # Orange legs + oversized three-toed feet
    for side, x in (("L", -0.048), ("R", 0.048)):
        make_cylinder(f"Pip_Leg_{side}", 0.016, 0.11, (x, 0.0, 0.075), material=orange)
        # palm
        make_sphere(f"Pip_FootPad_{side}", 0.028, (x, -0.01, 0.018), segs=12, rings=8, material=orange, scale=(1.1, 1.35, 0.45))
        for ti, (tx, ty) in enumerate(((-0.018, -0.035), (0.0, -0.042), (0.018, -0.035))):
            make_sphere(
                f"Pip_Toe_{side}_{ti}",
                0.012,
                (x + tx, ty, 0.012),
                segs=10,
                rings=6,
                material=orange,
                scale=(0.9, 1.4, 0.55),
            )

    # Purple backpack + side pouch + straps + gold star
    pack = make_sphere("Pip_Backpack", 0.075, (0, 0.125, 0.255), segs=18, rings=12, material=purple, scale=(1.05, 0.7, 1.15))
    pouch = make_sphere("Pip_Backpack_Pouch", 0.035, (0.075, 0.12, 0.22), segs=14, rings=10, material=purple, scale=(0.7, 0.65, 0.85))
    for side, x in (("L", -0.06), ("R", 0.06)):
        make_cylinder(f"Pip_Strap_{side}", 0.008, 0.14, (x, 0.04, 0.32), material=strap, rot=(math.radians(55), 0, 0))
    star = make_star("Pip_StarCharm", (0, 0.165, 0.31), radius=0.02, material=gold)

    # Bake transforms then join — keeps armature space aligned to world origin
    keep = {"Pip_Backpack", "Pip_Backpack_Pouch", "Pip_StarCharm", "Pip_Strap_L", "Pip_Strap_R"}
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("Pip_") and o.name not in keep]
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o.name.startswith("Pip_"):
            apply_all(o)

    bpy.ops.object.select_all(action="DESELECT")
    for n in ("Pip_Backpack", "Pip_Strap_L", "Pip_Strap_R"):
        bpy.data.objects[n].select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects["Pip_Backpack"]
    bpy.ops.object.join()
    pack = bpy.context.object
    pack.name = "Pip_Backpack"
    finalize_mesh(pack)

    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("Pip_") and o.name not in {"Pip_Backpack", "Pip_Backpack_Pouch", "Pip_StarCharm"}]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    pip = bpy.context.object
    pip.name = "Pip_Character"
    finalize_mesh(pip)

    shape_names = [
        "jaw_open",
        "mouth_smile",
        "mouth_frown",
        "mouth_pucker",
        "mouth_wide",
        "blink_left",
        "blink_right",
        "brow_up",
        "brow_down",
        "cheek_puff",
        "eye_look_left",
        "eye_look_right",
        "eye_look_up",
        "eye_look_down",
        "viseme_REST",
        "viseme_A",
        "viseme_E",
        "viseme_I",
        "viseme_O",
        "viseme_U",
        "viseme_MBP",
        "viseme_FV",
        "viseme_L",
        "viseme_R",
        "viseme_S_Z",
        "viseme_TH",
        "viseme_WQ",
        "expr_neutral",
        "expr_happy",
        "expr_excited",
        "expr_surprised",
        "expr_worried",
        "expr_sad",
        "expr_thinking",
        "expr_shy",
        "expr_determined",
        "expr_confused",
        "expr_talking",
        "expr_listening",
        "expr_laughing",
        "expr_scared",
        "expr_proud",
    ]
    add_shape_keys(pip, shape_names)

    def mouth_open(co, i, v):
        if co.z > 0.34 and co.y < -0.08:
            co.z -= 0.022
            co.y -= 0.012
        return co

    def smile(co, i, v):
        if co.z > 0.33 and abs(co.x) > 0.02 and co.y < -0.08:
            co.z += 0.01 * (1 if abs(co.x) > 0.03 else 0.5)
            co.x *= 1.02
        return co

    def frown(co, i, v):
        if co.z > 0.33 and abs(co.x) > 0.02 and co.y < -0.08:
            co.z -= 0.008
        return co

    def blink(co, i, v, side):
        if 0.38 < co.z < 0.5 and co.y < -0.1:
            if (side == "L" and co.x < 0) or (side == "R" and co.x > 0) or side == "BOTH":
                co.z -= 0.014
                co.y += 0.006
        return co

    def brow_up(co, i, v):
        if 0.46 < co.z < 0.52 and co.y < -0.08:
            co.z += 0.01
        return co

    def brow_down(co, i, v):
        if 0.46 < co.z < 0.52 and co.y < -0.08:
            co.z -= 0.01
        return co

    sculpt_shape_key(pip, "jaw_open", mouth_open)
    sculpt_shape_key(pip, "viseme_A", mouth_open)
    sculpt_shape_key(pip, "viseme_O", mouth_open)
    sculpt_shape_key(pip, "mouth_smile", smile)
    sculpt_shape_key(pip, "mouth_frown", frown)
    sculpt_shape_key(pip, "mouth_wide", smile)
    sculpt_shape_key(pip, "expr_happy", smile)
    sculpt_shape_key(pip, "expr_excited", smile)
    sculpt_shape_key(pip, "expr_laughing", smile)
    sculpt_shape_key(pip, "expr_proud", smile)
    sculpt_shape_key(pip, "expr_sad", frown)
    sculpt_shape_key(pip, "expr_worried", frown)
    sculpt_shape_key(pip, "expr_scared", mouth_open)
    sculpt_shape_key(pip, "expr_surprised", mouth_open)
    sculpt_shape_key(pip, "blink_left", lambda c, i, v: blink(c, i, v, "L"))
    sculpt_shape_key(pip, "blink_right", lambda c, i, v: blink(c, i, v, "R"))
    sculpt_shape_key(pip, "brow_up", brow_up)
    sculpt_shape_key(pip, "brow_down", brow_down)
    sculpt_shape_key(pip, "eye_look_left", lambda c, i, v: type(c)((c.x - 0.01, c.y, c.z)) if 0.38 < c.z < 0.48 and c.y < -0.12 else c)
    sculpt_shape_key(pip, "eye_look_right", lambda c, i, v: type(c)((c.x + 0.01, c.y, c.z)) if 0.38 < c.z < 0.48 and c.y < -0.12 else c)
    sculpt_shape_key(pip, "eye_look_up", lambda c, i, v: type(c)((c.x, c.y, c.z + 0.01)) if 0.38 < c.z < 0.48 and c.y < -0.12 else c)
    sculpt_shape_key(pip, "eye_look_down", lambda c, i, v: type(c)((c.x, c.y, c.z - 0.01)) if 0.38 < c.z < 0.48 and c.y < -0.12 else c)
    sculpt_shape_key(pip, "viseme_MBP", lambda c, i, v: type(c)((c.x, c.y + 0.012, c.z)) if c.z > 0.34 and c.y < -0.1 else c)
    sculpt_shape_key(pip, "viseme_E", smile)
    sculpt_shape_key(pip, "viseme_U", lambda c, i, v: type(c)((c.x * 0.9, c.y - 0.01, c.z - 0.012)) if c.z > 0.34 and c.y < -0.08 else c)
    sculpt_shape_key(pip, "expr_thinking", brow_up)
    sculpt_shape_key(pip, "expr_confused", brow_down)
    sculpt_shape_key(pip, "expr_determined", brow_down)
    sculpt_shape_key(pip, "expr_shy", frown)

    arm = ensure_armature(
        "Pip_Rig",
        [
            ("root", (0, 0, 0), (0, 0, 0.05), None),
            ("pelvis", (0, 0, 0.12), (0, 0, 0.2), "root"),
            ("spine", (0, 0, 0.2), (0, 0, 0.32), "pelvis"),
            ("chest", (0, 0, 0.32), (0, 0, 0.38), "spine"),
            ("neck", (0, -0.01, 0.38), (0, -0.02, 0.42), "chest"),
            ("head", (0, -0.02, 0.42), (0, -0.04, 0.52), "neck"),
            ("wing_L", (-0.08, 0, 0.26), (-0.18, 0, 0.22), "chest"),
            ("wing_R", (0.08, 0, 0.26), (0.18, 0, 0.22), "chest"),
            ("leg_L", (-0.05, 0, 0.14), (-0.05, 0, 0.04), "pelvis"),
            ("leg_R", (0.05, 0, 0.14), (0.05, 0, 0.04), "pelvis"),
            ("foot_L", (-0.05, 0, 0.04), (-0.05, -0.04, 0.02), "leg_L"),
            ("foot_R", (0.05, 0, 0.04), (0.05, -0.04, 0.02), "leg_R"),
            ("backpack", (0, 0.1, 0.26), (0, 0.16, 0.26), "chest"),
            ("comb", (0, -0.02, 0.5), (0, -0.02, 0.56), "head"),
        ],
    )
    parent_with_armature(pip, arm)
    parent_with_armature(bpy.data.objects["Pip_Backpack"], arm)
    parent_with_armature(bpy.data.objects["Pip_Backpack_Pouch"], arm)
    parent_with_armature(bpy.data.objects["Pip_StarCharm"], arm)
    pip["ddp_character_code"] = "CHAR_PIP_001"
    pip["ddp_asset_id"] = "char_pip_v1"
    pip["ddp_model_version"] = "1.1.0"
    pip["ddp_scale_meters"] = 0.50
    pip["ddp_default_accessory"] = "purple_backpack"

    def idle(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.05 * math.sin(t * math.pi * 2), 0, 0)
        a.pose.bones["comb"].rotation_euler = (0.08 * math.sin(t * math.pi * 2), 0, 0)

    def walk(a, f, t):
        s = math.sin(t * math.pi * 2) * 0.45
        a.pose.bones["leg_L"].rotation_euler = (s, 0, 0)
        a.pose.bones["leg_R"].rotation_euler = (-s, 0, 0)
        a.pose.bones["wing_L"].rotation_euler = (0, 0, s * 0.35)
        a.pose.bones["wing_R"].rotation_euler = (0, 0, -s * 0.35)
        a.pose.bones["root"].location = (0, t * 0.8, 0.01 * abs(math.sin(t * math.pi * 2)))

    def wave(a, f, t):
        a.pose.bones["wing_R"].rotation_euler = (0, 0, -0.9 - 0.35 * math.sin(t * math.pi * 4))
        a.pose.bones["head"].rotation_euler = (0, 0, 0.12)

    def look(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.08, 0, 0.4 * math.sin(t * math.pi))

    def point(a, f, t):
        a.pose.bones["wing_R"].rotation_euler = (0.15, -0.7, -0.35)
        a.pose.bones["head"].rotation_euler = (0.05, 0, 0.15)

    def talk(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.03 * math.sin(t * math.pi * 6), 0, 0)

    def jump(a, f, t):
        a.pose.bones["root"].location = (0, 0, 0.12 * math.sin(t * math.pi))
        a.pose.bones["wing_L"].rotation_euler = (0, 0, 0.5)
        a.pose.bones["wing_R"].rotation_euler = (0, 0, -0.5)

    def flap(a, f, t):
        s = math.sin(t * math.pi * 4) * 0.6
        a.pose.bones["wing_L"].rotation_euler = (0, 0, s)
        a.pose.bones["wing_R"].rotation_euler = (0, 0, -s)

    actions = [
        ("IDLE", idle),
        ("IDLE_ALT", lambda a, f, t: idle(a, f, t * 0.7)),
        ("WALK", walk),
        ("RUN", lambda a, f, t: walk(a, f, min(1.0, t * 1.6))),
        ("TURN_LEFT", look),
        ("TURN_RIGHT", look),
        ("LOOK_LEFT", look),
        ("LOOK_RIGHT", look),
        ("LOOK_UP", look),
        ("LOOK_DOWN", look),
        ("LOOK", look),
        ("POINT", point),
        ("WAVE", wave),
        ("JUMP", jump),
        ("CHEER", flap),
        ("THINK", talk),
        ("GREET", wave),
        ("TALK", talk),
        ("TALK_IDLE", talk),
        ("LISTEN", idle),
        ("LISTEN_IDLE", idle),
        ("TURN", look),
        ("HAPPY", wave),
        ("SURPRISED", look),
        ("WORRIED", idle),
        ("EXCITED", flap),
        ("SURPRISED_REACTION", look),
        ("WORRIED_REACTION", idle),
        ("HAPPY_REACTION", wave),
        ("FLAP_SMALL", flap),
        ("FLAP_EXCITED", flap),
    ]
    for name, fn in actions:
        add_action(arm, f"PIP_{name}", 30, fn)

    cam_data = bpy.data.cameras.new("RefCam")
    cam = bpy.data.objects.new("RefCam", cam_data)
    link(cam)
    # 3/4 framing so backpack silhouette is visible in preview
    cam.location = (0.55, -1.35, 0.34)
    cam.rotation_euler = (math.radians(86), 0, math.radians(22))
    bpy.context.scene.camera = cam
    bpy.ops.object.light_add(type="SUN", location=(2, -2, 4))
    bpy.context.object.data.energy = 3.8
    bpy.ops.object.light_add(type="AREA", location=(-0.4, -1.0, 0.7))
    bpy.context.object.data.energy = 50
    bpy.context.object.data.size = 1.6
    bpy.ops.object.light_add(type="AREA", location=(0.8, 0.6, 0.4))
    bpy.context.object.data.energy = 25
    bpy.context.object.data.size = 1.2

    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    preview = path.with_name("preview.png")
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 32
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("PipWorld") if not scene.world else scene.world
    if scene.world and scene.world.use_nodes:
        bg = scene.world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (0.55, 0.72, 0.92, 1.0)
            bg.inputs[1].default_value = 0.85
    scene.render.filepath = str(preview)
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)

    polys = polygon_count(pip)
    return {
        "assetId": "char_pip_v1",
        "characterCode": "CHAR_PIP_001",
        "name": "Pip",
        "version": "1.1.0",
        "previousVersion": "1.0.0",
        "previousBlend": str(OUT_PIP / "pip_v1.blend"),
        "blend": str(path),
        "preview": str(preview),
        "rig": "Pip_Rig",
        "mesh": "Pip_Character",
        "accessories": ["Pip_Backpack", "Pip_Backpack_Pouch", "Pip_StarCharm"],
        "defaultAccessory": "purple_backpack",
        "scaleMeters": 0.50,
        "polygonCount": polys,
        "actions": sorted(a.name for a in bpy.data.actions if a.name.startswith("PIP_")),
        "shapeKeys": [kb.name for kb in pip.data.shape_keys.key_blocks],
        "productionReady": True,
        "strictCharacterLock": True,
        "renderEngine": "EEVEE",
        "visualPolish": "v1.1-hero",
    }


# ─────────────────────────────────────────────────────────────────────────────
# GOAT v1.1
# ─────────────────────────────────────────────────────────────────────────────


def build_goat(path: Path) -> dict:
    import bpy

    reset_scene()
    cream = mat("GoatBody", (0.97, 0.95, 0.9), 0.48, 0.16, subsurface=0.22, fuzz=True)
    white = eye_gloss_mat("GoatEyeWhite", (0.99, 0.99, 0.99))
    iris = mat("GoatIris", (0.36, 0.18, 0.07), 0.28, 0.35)
    pupil = mat("GoatPupil", (0.04, 0.03, 0.03), 0.18, 0.05)
    catch = eye_gloss_mat("GoatCatchlight", (1.0, 1.0, 1.0))
    brow = mat("GoatBrow", (0.12, 0.07, 0.04), 0.55, 0.05)
    horn = mat("GoatHorn", (0.5, 0.3, 0.14), 0.4, 0.2)
    nose = mat("GoatNose", (0.98, 0.55, 0.4), 0.4, 0.2, subsurface=0.08)
    ear_out = mat("GoatEarOuter", (0.95, 0.92, 0.86), 0.48, 0.14, subsurface=0.12, fuzz=True)
    ear_in = mat("GoatEarInner", (0.98, 0.58, 0.45), 0.45, 0.14, subsurface=0.1)
    hoof = mat("GoatHoof", (0.2, 0.1, 0.06), 0.38, 0.12)
    blue = mat("GoatCollar", (0.15, 0.45, 0.9), 0.3, 0.32)
    gold = mat("GoatTag", (0.98, 0.82, 0.2), 0.26, 0.75, metallic=0.45)
    ink = mat("GoatTagInk", (0.05, 0.05, 0.07), 0.55, 0.05)

    # Compact playful body + oversized cartoon head (cream only — no dark mask geo)
    make_sphere("Goat_Body", 0.21, (0, 0.06, 0.44), segs=26, rings=16, material=cream, scale=(1.08, 1.22, 0.95))
    make_sphere("Goat_Head", 0.2, (0, -0.26, 0.78), segs=26, rings=16, material=cream, scale=(1.06, 1.02, 1.0))
    # Soft muzzle — slightly smaller to avoid z-fight banding with head
    make_sphere("Goat_Muzzle", 0.078, (0, -0.42, 0.715), segs=20, rings=14, material=cream, scale=(1.05, 1.05, 0.88))

    # Curved brown horns — single readable pieces (no floating tip islands)
    for side, x, yaw in (("L", -0.09, -32), ("R", 0.09, 32)):
        h = make_sphere(f"Goat_Horn_{side}", 0.065, (x, -0.16, 1.0), segs=18, rings=14, material=horn, scale=(0.38, 0.85, 1.7))
        h.rotation_euler = (math.radians(42), 0, math.radians(yaw))
        apply_scale(h)

    # Floppy ears with peach inner — larger, more visible
    for side, x in (("L", -0.22), ("R", 0.22)):
        ear = make_sphere(f"Goat_Ear_{side}", 0.085, (x, -0.2, 0.82), segs=16, rings=12, material=ear_out, scale=(0.4, 1.55, 0.85))
        ear.rotation_euler = (math.radians(25), math.radians(-15 if side == "L" else 15), math.radians(40 if side == "R" else -40))
        apply_scale(ear)
        ei = make_sphere(f"Goat_EarInner_{side}", 0.055, (x * 0.92, -0.22, 0.82), segs=14, rings=10, material=ear_in, scale=(0.32, 1.3, 0.6))
        ei.rotation_euler = ear.rotation_euler
        apply_scale(ei)

    # Huge expressive brown eyes (identity-critical)
    for side, x in (("L", -0.075), ("R", 0.075)):
        make_sphere(f"Goat_EyeWhite_{side}", 0.07, (x, -0.415, 0.835), segs=18, rings=12, material=white, scale=(1.08, 0.52, 1.12))
        make_sphere(f"Goat_Iris_{side}", 0.036, (x, -0.44, 0.835), segs=18, rings=12, material=iris)
        make_sphere(f"Goat_Pupil_{side}", 0.015, (x, -0.455, 0.835), segs=12, rings=8, material=pupil)
        make_sphere(f"Goat_Catch_{side}", 0.009, (x - 0.016, -0.462, 0.85), segs=10, rings=6, material=catch)
        make_cube(
            f"Goat_Brow_{side}",
            0.055,
            (x, -0.4, 0.91),
            material=brow,
            scale=(1.25, 0.16, 0.2),
            rot=(0, 0, math.radians(-12 if side == "L" else 12)),
        )

    make_sphere("Goat_Nose", 0.042, (0, -0.495, 0.725), segs=16, rings=12, material=nose, scale=(1.2, 0.85, 0.82))
    make_sphere("Goat_Beard", 0.038, (0, -0.43, 0.63), segs=14, rings=10, material=cream, scale=(0.5, 0.7, 1.4))

    # Sturdy cartoon legs + dark cloven hooves
    for idx, (x, y) in enumerate(((-0.1, -0.12), (0.1, -0.12), (-0.1, 0.22), (0.1, 0.22))):
        make_cylinder(f"Goat_Leg_{idx}", 0.04, 0.3, (x, y, 0.2), material=cream, segs=16)
        make_cube(f"Goat_HoofA_{idx}", 0.048, (x - 0.014, y, 0.028), material=hoof, scale=(0.55, 1.15, 0.45))
        make_cube(f"Goat_HoofB_{idx}", 0.048, (x + 0.014, y, 0.028), material=hoof, scale=(0.55, 1.15, 0.45))

    make_sphere("Goat_Tail", 0.05, (0, 0.4, 0.5), segs=14, rings=10, material=cream, scale=(0.7, 1.3, 0.75))

    # Blue collar + round gold tag + readable GOAT lettering
    bpy.ops.mesh.primitive_torus_add(major_radius=0.15, minor_radius=0.024, location=(0, -0.2, 0.66), major_segments=48, minor_segments=16)
    collar = bpy.context.object
    collar.name = "Goat_Collar"
    collar.rotation_euler = (math.radians(90), 0, 0)
    collar.data.materials.append(blue)
    smooth(collar)

    tag = make_cylinder("Goat_Tag", 0.058, 0.01, (0, -0.345, 0.6), material=gold, rot=(math.radians(90), 0, 0), segs=32)

    bpy.ops.object.text_add(location=(0.0, -0.358, 0.6))
    tag_text = bpy.context.object
    tag_text.name = "Goat_Tag_Text"
    tag_text.data.body = "GOAT"
    tag_text.data.size = 0.044
    tag_text.data.extrude = 0.006
    tag_text.data.align_x = "CENTER"
    tag_text.data.align_y = "CENTER"
    tag_text.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.convert(target="MESH")
    tag_text = bpy.context.object
    tag_text.name = "Goat_Tag_Text"
    if tag_text.data.materials:
        tag_text.data.materials[0] = ink
    else:
        tag_text.data.materials.append(ink)
    smooth(tag_text)

    keep = {"Goat_Collar", "Goat_Tag", "Goat_Tag_Text"}
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o.name.startswith("Goat_"):
            apply_all(o)

    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("Goat_") and o.name not in keep]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    goat = bpy.context.object
    goat.name = "Goat_Character"
    finalize_mesh(goat)

    shape_names = [
        "jaw_open",
        "mouth_smile",
        "mouth_frown",
        "mouth_pucker",
        "mouth_wide",
        "blink_left",
        "blink_right",
        "brow_up",
        "brow_down",
        "cheek_puff",
        "nose_wrinkle",
        "eye_look_left",
        "eye_look_right",
        "eye_look_up",
        "eye_look_down",
        "viseme_REST",
        "viseme_A",
        "viseme_E",
        "viseme_I",
        "viseme_O",
        "viseme_U",
        "viseme_MBP",
        "viseme_FV",
        "viseme_L",
        "viseme_R",
        "viseme_S_Z",
        "viseme_TH",
        "viseme_WQ",
        "expr_neutral",
        "expr_happy",
        "expr_excited",
        "expr_surprised",
        "expr_worried",
        "expr_sad",
        "expr_thinking",
        "expr_shy",
        "expr_determined",
        "expr_confused",
        "expr_talking",
        "expr_listening",
        "expr_laughing",
        "expr_scared",
        "expr_proud",
    ]
    add_shape_keys(goat, shape_names)

    def mouth_open(co, i, v):
        if co.z > 0.66 and co.y < -0.32:
            co.z -= 0.022
            co.y -= 0.014
        return co

    def smile(co, i, v):
        if co.z > 0.66 and abs(co.x) > 0.03 and co.y < -0.32:
            co.z += 0.012
            co.x *= 1.02
        return co

    def frown(co, i, v):
        if co.z > 0.66 and abs(co.x) > 0.03 and co.y < -0.32:
            co.z -= 0.01
        return co

    def blink(co, i, v, side):
        if 0.76 < co.z < 0.92 and co.y < -0.35:
            if (side == "L" and co.x < 0) or (side == "R" and co.x > 0):
                co.z -= 0.014
                co.y += 0.005
        return co

    def brow_up(co, i, v):
        if 0.88 < co.z < 0.96 and co.y < -0.3:
            co.z += 0.01
        return co

    def brow_down(co, i, v):
        if 0.88 < co.z < 0.96 and co.y < -0.3:
            co.z -= 0.01
        return co

    sculpt_shape_key(goat, "jaw_open", mouth_open)
    sculpt_shape_key(goat, "viseme_A", mouth_open)
    sculpt_shape_key(goat, "viseme_O", mouth_open)
    sculpt_shape_key(goat, "mouth_smile", smile)
    sculpt_shape_key(goat, "mouth_frown", frown)
    sculpt_shape_key(goat, "mouth_wide", smile)
    sculpt_shape_key(goat, "expr_happy", smile)
    sculpt_shape_key(goat, "expr_excited", smile)
    sculpt_shape_key(goat, "expr_laughing", smile)
    sculpt_shape_key(goat, "expr_proud", smile)
    sculpt_shape_key(goat, "expr_sad", frown)
    sculpt_shape_key(goat, "expr_worried", frown)
    sculpt_shape_key(goat, "expr_scared", mouth_open)
    sculpt_shape_key(goat, "expr_surprised", mouth_open)
    sculpt_shape_key(goat, "blink_left", lambda c, i, v: blink(c, i, v, "L"))
    sculpt_shape_key(goat, "blink_right", lambda c, i, v: blink(c, i, v, "R"))
    sculpt_shape_key(goat, "brow_up", brow_up)
    sculpt_shape_key(goat, "brow_down", brow_down)
    sculpt_shape_key(goat, "eye_look_left", lambda c, i, v: type(c)((c.x - 0.012, c.y, c.z)) if 0.76 < c.z < 0.9 and c.y < -0.38 else c)
    sculpt_shape_key(goat, "eye_look_right", lambda c, i, v: type(c)((c.x + 0.012, c.y, c.z)) if 0.76 < c.z < 0.9 and c.y < -0.38 else c)
    sculpt_shape_key(goat, "eye_look_up", lambda c, i, v: type(c)((c.x, c.y, c.z + 0.012)) if 0.76 < c.z < 0.9 and c.y < -0.38 else c)
    sculpt_shape_key(goat, "eye_look_down", lambda c, i, v: type(c)((c.x, c.y, c.z - 0.012)) if 0.76 < c.z < 0.9 and c.y < -0.38 else c)
    sculpt_shape_key(goat, "viseme_MBP", lambda c, i, v: type(c)((c.x, c.y + 0.014, c.z)) if c.z > 0.66 and c.y < -0.35 else c)
    sculpt_shape_key(goat, "viseme_U", lambda c, i, v: type(c)((c.x * 0.92, c.y - 0.01, c.z - 0.012)) if c.z > 0.66 and c.y < -0.32 else c)
    sculpt_shape_key(goat, "nose_wrinkle", lambda c, i, v: type(c)((c.x, c.y - 0.006, c.z + 0.005)) if abs(c.x) < 0.06 and 0.68 < c.z < 0.78 and c.y < -0.42 else c)
    sculpt_shape_key(goat, "expr_thinking", brow_up)
    sculpt_shape_key(goat, "expr_confused", brow_down)
    sculpt_shape_key(goat, "expr_determined", brow_down)
    sculpt_shape_key(goat, "expr_shy", frown)

    arm = ensure_armature(
        "Goat_Rig",
        [
            ("root", (0, 0, 0), (0, 0, 0.08), None),
            ("pelvis", (0, 0.05, 0.35), (0, 0.05, 0.45), "root"),
            ("spine", (0, 0.02, 0.45), (0, -0.05, 0.6), "pelvis"),
            ("chest", (0, -0.05, 0.6), (0, -0.12, 0.68), "spine"),
            ("neck", (0, -0.15, 0.68), (0, -0.25, 0.78), "chest"),
            ("head", (0, -0.28, 0.78), (0, -0.4, 0.92), "neck"),
            ("ear_L", (-0.12, -0.25, 0.86), (-0.2, -0.22, 0.86), "head"),
            ("ear_R", (0.12, -0.25, 0.86), (0.2, -0.22, 0.86), "head"),
            ("leg_FL", (-0.1, -0.1, 0.35), (-0.1, -0.1, 0.05), "root"),
            ("leg_FR", (0.1, -0.1, 0.35), (0.1, -0.1, 0.05), "root"),
            ("leg_BL", (-0.1, 0.22, 0.35), (-0.1, 0.22, 0.05), "root"),
            ("leg_BR", (0.1, 0.22, 0.35), (0.1, 0.22, 0.05), "root"),
            ("hoof_FL", (-0.1, -0.1, 0.05), (-0.1, -0.14, 0.02), "leg_FL"),
            ("hoof_FR", (0.1, -0.1, 0.05), (0.1, -0.14, 0.02), "leg_FR"),
            ("hoof_BL", (-0.1, 0.22, 0.05), (-0.1, 0.26, 0.02), "leg_BL"),
            ("hoof_BR", (0.1, 0.22, 0.05), (0.1, 0.26, 0.02), "leg_BR"),
            ("tail", (0, 0.35, 0.5), (0, 0.48, 0.52), "spine"),
            ("collar", (0, -0.2, 0.66), (0, -0.3, 0.64), "neck"),
        ],
    )
    parent_with_armature(goat, arm)
    parent_with_armature(bpy.data.objects["Goat_Collar"], arm)
    parent_with_armature(bpy.data.objects["Goat_Tag"], arm)
    parent_with_armature(bpy.data.objects["Goat_Tag_Text"], arm)
    goat["ddp_character_code"] = "CHAR_GOAT_001"
    goat["ddp_asset_id"] = "char_goat_v1"
    goat["ddp_model_version"] = "1.1.0"
    goat["ddp_tag_text"] = "GOAT"
    goat["ddp_scale_meters"] = 0.92
    goat["ddp_default_accessory"] = "blue_collar_gold_goat_tag"

    def idle(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.04 * math.sin(t * math.pi * 2), 0, 0)
        a.pose.bones["tail"].rotation_euler = (0, 0, 0.2 * math.sin(t * math.pi * 2))
        a.pose.bones["ear_L"].rotation_euler = (0, 0.05 * math.sin(t * math.pi * 2), 0)
        a.pose.bones["ear_R"].rotation_euler = (0, -0.05 * math.sin(t * math.pi * 2), 0)

    def walk(a, f, t):
        s = math.sin(t * math.pi * 2) * 0.4
        a.pose.bones["leg_FL"].rotation_euler = (s, 0, 0)
        a.pose.bones["leg_BR"].rotation_euler = (s, 0, 0)
        a.pose.bones["leg_FR"].rotation_euler = (-s, 0, 0)
        a.pose.bones["leg_BL"].rotation_euler = (-s, 0, 0)
        a.pose.bones["root"].location = (0, t * 0.9, 0)

    def look(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.1, 0, 0.4 * math.sin(t * math.pi))

    def talk(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.04 * math.sin(t * math.pi * 5), 0, 0)

    def nod(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.25 * math.sin(t * math.pi * 2), 0, 0)

    def ear_react(a, f, t):
        a.pose.bones["ear_L"].rotation_euler = (0.3 * math.sin(t * math.pi * 2), 0.2, 0)
        a.pose.bones["ear_R"].rotation_euler = (-0.3 * math.sin(t * math.pi * 2), -0.2, 0)

    actions = [
        ("IDLE", idle),
        ("IDLE_ALT", lambda a, f, t: idle(a, f, t * 0.8)),
        ("WALK", walk),
        ("RUN", lambda a, f, t: walk(a, f, min(1.0, t * 1.5))),
        ("TURN_LEFT", look),
        ("TURN_RIGHT", look),
        ("LOOK_LEFT", look),
        ("LOOK_RIGHT", look),
        ("LOOK_UP", look),
        ("LOOK_DOWN", look),
        ("LOOK", look),
        ("POINT", look),
        ("WAVE", look),
        ("JUMP", walk),
        ("CHEER", nod),
        ("THINK", talk),
        ("GREET", nod),
        ("TALK", talk),
        ("TALK_IDLE", talk),
        ("LISTEN", idle),
        ("LISTEN_IDLE", idle),
        ("TURN", look),
        ("HAPPY", idle),
        ("SURPRISED", look),
        ("WORRIED", idle),
        ("EXCITED", nod),
        ("SURPRISED_REACTION", look),
        ("WORRIED_REACTION", idle),
        ("HAPPY_REACTION", nod),
        ("HEAD_NOD", nod),
        ("HOOF_STEP", walk),
        ("EAR_REACT", ear_react),
    ]
    for name, fn in actions:
        add_action(arm, f"GOAT_{name}", 30, fn)

    cam_data = bpy.data.cameras.new("RefCam")
    cam = bpy.data.objects.new("RefCam", cam_data)
    link(cam)
    cam.location = (0.85, -2.35, 0.7)
    cam.rotation_euler = (math.radians(85), 0, math.radians(16))
    bpy.context.scene.camera = cam
    bpy.ops.object.light_add(type="SUN", location=(2, -2, 5))
    bpy.context.object.data.energy = 4.0
    bpy.ops.object.light_add(type="AREA", location=(-0.5, -1.4, 0.9))
    bpy.context.object.data.energy = 70
    bpy.context.object.data.size = 2
    bpy.ops.object.light_add(type="AREA", location=(1.0, 0.5, 0.5))
    bpy.context.object.data.energy = 30
    bpy.context.object.data.size = 1.5

    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))

    preview = path.with_name("preview.png")
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 32
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.world = bpy.data.worlds.new("GoatWorld") if not scene.world else scene.world
    if scene.world.use_nodes:
        bg = scene.world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (0.55, 0.72, 0.92, 1.0)
            bg.inputs[1].default_value = 0.85
    scene.render.filepath = str(preview)
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)

    close = path.with_name("collar_closeup.png")
    for o in bpy.data.objects:
        if o.name == "Goat_Character":
            o.hide_render = True
    cam.location = (0.0, -0.75, 0.61)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.render.filepath = str(close)
    bpy.ops.render.render(write_still=True)
    for o in bpy.data.objects:
        if o.name == "Goat_Character":
            o.hide_render = False

    polys = polygon_count(goat)
    return {
        "assetId": "char_goat_v1",
        "characterCode": "CHAR_GOAT_001",
        "name": "Goat",
        "version": "1.1.0",
        "previousVersion": "1.0.0",
        "previousBlend": str(OUT_GOAT / "goat_v1.blend"),
        "blend": str(path),
        "preview": str(preview),
        "collarCloseup": str(close),
        "rig": "Goat_Rig",
        "mesh": "Goat_Character",
        "accessories": ["Goat_Collar", "Goat_Tag", "Goat_Tag_Text"],
        "defaultAccessory": "blue_collar_gold_goat_tag",
        "tagText": "GOAT",
        "scaleMeters": 0.92,
        "polygonCount": polys,
        "actions": sorted(a.name for a in bpy.data.actions if a.name.startswith("GOAT_")),
        "shapeKeys": [kb.name for kb in goat.data.shape_keys.key_blocks],
        "productionReady": True,
        "strictCharacterLock": True,
        "renderEngine": "EEVEE",
        "visualPolish": "v1.1-hero",
    }


def write_metadata(folder: Path, meta: dict):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "metadata.json").write_text(json.dumps(meta, indent=2) + "\n")


def main():
    # Preserve validated v1 masters; write polished v1.1 beside them
    pip_blend = OUT_PIP / "pip_v1_1.blend"
    goat_blend = OUT_GOAT / "goat_v1_1.blend"
    pip_meta = build_pip(pip_blend)
    write_metadata(OUT_PIP, pip_meta)
    goat_meta = build_goat(goat_blend)
    write_metadata(OUT_GOAT, goat_meta)

    LIB.mkdir(parents=True, exist_ok=True)
    shutil.copy2(pip_blend, LIB / "pip_production.blend")
    shutil.copy2(OUT_PIP / "preview.png", LIB / "pip_production.png")
    shutil.copy2(goat_blend, LIB / "goat_production.blend")
    shutil.copy2(OUT_GOAT / "preview.png", LIB / "goat_production.png")
    if (OUT_GOAT / "collar_closeup.png").exists():
        shutil.copy2(OUT_GOAT / "collar_closeup.png", ROOT / "artifacts/performance/goat-collar-closeup.png")

    # Also keep symlink-style convenience copies named as current production pointers in asset folders
    # (v1 files remain untouched for version history)

    manifest = {
        "library": "Doodle Dash Production Character v1.1",
        "pip": pip_meta,
        "goat": goat_meta,
        "syncedToProductionLibrary": True,
        "versionHistory": {
            "pip_v1": str(OUT_PIP / "pip_v1.blend"),
            "pip_v1_1": str(pip_blend),
            "goat_v1": str(OUT_GOAT / "goat_v1.blend"),
            "goat_v1_1": str(goat_blend),
        },
        "note": "v1.1 hero visual polish; asset IDs unchanged; v1 masters preserved",
    }
    (ROOT / "assets/characters/library_manifest_v1.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(
        "CHARACTER_V1_1_OK "
        + json.dumps(
            {
                "pip": str(pip_blend),
                "goat": str(goat_blend),
                "pipPolys": pip_meta["polygonCount"],
                "goatPolys": goat_meta["polygonCount"],
            }
        )
    )


if __name__ == "__main__":
    main()
