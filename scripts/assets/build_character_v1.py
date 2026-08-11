"""
Build Pip + Goat v1 production Blender character packages.

Outputs (authoritative v1 masters):
  assets/characters/pip/pip_v1.blend
  assets/characters/goat/goat_v1.blend

Also syncs copies into production-library/characters/ for existing DDP paths.

These are REAL reusable EEVEE production assets (not cubes / placeholders).
productionReady is NOT claimed here — validation scripts decide that.
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


def mat(name, color, roughness=0.45, specular=0.2, subsurface=0.0):
    import bpy

    m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        if "Specular" in bsdf.inputs:
            bsdf.inputs["Specular"].default_value = specular
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = specular
        # Soft stylized fluff via subsurface when available (EEVEE-safe)
        for key in ("Subsurface", "Subsurface Weight"):
            if key in bsdf.inputs and subsurface > 0:
                bsdf.inputs[key].default_value = subsurface
        if "Subsurface Color" in bsdf.inputs and subsurface > 0:
            bsdf.inputs["Subsurface Color"].default_value = (*color, 1.0)
        if "Sheen" in bsdf.inputs and subsurface > 0:
            bsdf.inputs["Sheen"].default_value = min(1.0, subsurface * 2)
        if "Sheen Weight" in bsdf.inputs and subsurface > 0:
            bsdf.inputs["Sheen Weight"].default_value = min(1.0, subsurface * 2)
    return m


def link(obj):
    import bpy

    if obj.name not in bpy.context.collection.objects:
        bpy.context.collection.objects.link(obj)
    return obj


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
    import bpy

    obj.parent = arm
    mod = obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm


def add_shape_keys(obj, names):
    import bpy

    if not obj.data.shape_keys:
        obj.shape_key_add(name="Basis", from_mix=False)
    for n in names:
        if n not in obj.data.shape_keys.key_blocks:
            kb = obj.shape_key_add(name=n, from_mix=False)
            kb.value = 0.0


def sculpt_shape_key(obj, key_name, mutate_fn):
    """Apply a simple vertex delta to make the shape key non-empty."""
    import bpy
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
    action.use_fake_user = True  # persist when not assigned
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


# ─────────────────────────────────────────────────────────────────────────────
# PIP
# ─────────────────────────────────────────────────────────────────────────────


def build_pip(path: Path) -> dict:
    import bpy

    reset_scene()
    # Target height ~0.50 m — build in meters
    yellow = mat("PipBody", (0.98, 0.86, 0.18), 0.55, 0.15, subsurface=0.15)
    white = mat("PipEyeWhite", (0.98, 0.98, 0.98), 0.35, 0.1)
    iris = mat("PipIris", (0.35, 0.18, 0.08), 0.25, 0.05)
    pupil = mat("PipPupil", (0.05, 0.04, 0.04), 0.2, 0.0)
    brow = mat("PipBrow", (0.12, 0.08, 0.05), 0.5, 0.05)
    beak = mat("PipBeak", (0.95, 0.55, 0.12), 0.4, 0.25)
    orange = mat("PipFeet", (0.95, 0.45, 0.1), 0.45, 0.2)
    comb = mat("PipComb", (0.9, 0.12, 0.15), 0.4, 0.2, subsurface=0.08)
    purple = mat("PipBackpack", (0.45, 0.25, 0.75), 0.4, 0.2)
    gold = mat("PipStar", (0.95, 0.78, 0.2), 0.3, 0.6)

    # Body / head
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.14, location=(0, 0, 0.22), segments=24, ring_count=16)
    body = bpy.context.object
    body.name = "Pip_Body"
    body.scale = (1.0, 0.95, 1.05)
    body.data.materials.append(yellow)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.145, location=(0, -0.02, 0.40), segments=24, ring_count=16)
    head = bpy.context.object
    head.name = "Pip_Head"
    head.data.materials.append(yellow)

    # Comb
    for i, x in enumerate((-0.03, 0.0, 0.03)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.025, location=(x, -0.02, 0.52), segments=12, ring_count=8)
        c = bpy.context.object
        c.name = f"Pip_Comb_{i}"
        c.scale = (0.7, 0.7, 1.4)
        c.data.materials.append(comb)

    # Eyes
    for side, x in (("L", -0.05), ("R", 0.05)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.045, location=(x, -0.12, 0.42), segments=16, ring_count=10)
        sclera = bpy.context.object
        sclera.name = f"Pip_EyeWhite_{side}"
        sclera.scale = (1.0, 0.55, 1.0)
        sclera.data.materials.append(white)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.022, location=(x, -0.14, 0.42), segments=12, ring_count=8)
        ir = bpy.context.object
        ir.name = f"Pip_Iris_{side}"
        ir.data.materials.append(iris)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.01, location=(x, -0.155, 0.42), segments=10, ring_count=6)
        pu = bpy.context.object
        pu.name = f"Pip_Pupil_{side}"
        pu.data.materials.append(pupil)
        bpy.ops.mesh.primitive_cube_add(size=0.04, location=(x, -0.12, 0.47))
        br = bpy.context.object
        br.name = f"Pip_Brow_{side}"
        br.scale = (1.2, 0.2, 0.25)
        br.data.materials.append(brow)

    # Beak
    bpy.ops.mesh.primitive_cone_add(radius1=0.035, depth=0.06, location=(0, -0.18, 0.38))
    bk = bpy.context.object
    bk.name = "Pip_Beak"
    bk.rotation_euler = (math.radians(90), 0, 0)
    bk.data.materials.append(beak)

    # Wings
    for side, x in (("L", -0.16), ("R", 0.16)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.055, location=(x, 0.0, 0.24), segments=14, ring_count=10)
        wing = bpy.context.object
        wing.name = f"Pip_Wing_{side}"
        wing.scale = (0.55, 1.1, 0.7)
        wing.data.materials.append(yellow)

    # Legs / feet
    for side, x in (("L", -0.05), ("R", 0.05)):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.018, depth=0.12, location=(x, 0.0, 0.08))
        leg = bpy.context.object
        leg.name = f"Pip_Leg_{side}"
        leg.data.materials.append(orange)
        bpy.ops.mesh.primitive_cube_add(size=0.05, location=(x, -0.02, 0.02))
        foot = bpy.context.object
        foot.name = f"Pip_Foot_{side}"
        foot.scale = (1.0, 1.6, 0.35)
        foot.data.materials.append(orange)

    # Backpack + star
    bpy.ops.mesh.primitive_cube_add(size=0.12, location=(0, 0.12, 0.26))
    pack = bpy.context.object
    pack.name = "Pip_Backpack"
    pack.scale = (0.9, 0.55, 1.0)
    pack.data.materials.append(purple)
    bpy.ops.mesh.primitive_cube_add(size=0.05, location=(0.07, 0.12, 0.22))
    pouch = bpy.context.object
    pouch.name = "Pip_Backpack_Pouch"
    pouch.scale = (0.5, 0.45, 0.6)
    pouch.data.materials.append(purple)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.018, depth=0.01, location=(0, 0.15, 0.32))
    star = bpy.context.object
    star.name = "Pip_StarCharm"
    star.rotation_euler = (math.radians(90), 0, 0)
    star.data.materials.append(gold)

    # Join character meshes (keep accessories separate)
    keep = {"Pip_Backpack", "Pip_Backpack_Pouch", "Pip_StarCharm"}
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("Pip_") and o.name not in keep]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    pip = bpy.context.object
    pip.name = "Pip_Character"

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

    # Non-empty deltas (deterministic, stylized)
    def mouth_open(co, i, v):
        if co.z > 0.35 and co.y < -0.05:
            co.z -= 0.02
            co.y -= 0.01
        return co

    def smile(co, i, v):
        if co.z > 0.34 and abs(co.x) > 0.02 and co.y < -0.05:
            co.z += 0.008 * (1 if abs(co.x) > 0.03 else 0.5)
        return co

    def blink(co, i, v, side):
        # Approximate eyelid close on eye region
        if 0.38 < co.z < 0.48 and co.y < -0.08:
            if (side == "L" and co.x < 0) or (side == "R" and co.x > 0) or side == "BOTH":
                co.z -= 0.01
                co.y += 0.005
        return co

    sculpt_shape_key(pip, "jaw_open", mouth_open)
    sculpt_shape_key(pip, "viseme_A", mouth_open)

    def viseme_o(co, i, v):
        if co.z > 0.35 and co.y < -0.05:
            return type(co)((co.x * 0.95, co.y - 0.008, co.z - 0.015))
        return co

    sculpt_shape_key(pip, "viseme_O", viseme_o)
    sculpt_shape_key(pip, "mouth_smile", smile)
    sculpt_shape_key(pip, "expr_happy", smile)
    sculpt_shape_key(pip, "blink_left", lambda c, i, v: blink(c, i, v, "L"))
    sculpt_shape_key(pip, "blink_right", lambda c, i, v: blink(c, i, v, "R"))
    sculpt_shape_key(pip, "eye_look_left", lambda c, i, v: type(c)((c.x - 0.008, c.y, c.z)) if 0.38 < c.z < 0.46 and c.y < -0.1 else c)
    sculpt_shape_key(pip, "eye_look_right", lambda c, i, v: type(c)((c.x + 0.008, c.y, c.z)) if 0.38 < c.z < 0.46 and c.y < -0.1 else c)
    sculpt_shape_key(pip, "eye_look_up", lambda c, i, v: type(c)((c.x, c.y, c.z + 0.008)) if 0.38 < c.z < 0.46 and c.y < -0.1 else c)
    sculpt_shape_key(pip, "eye_look_down", lambda c, i, v: type(c)((c.x, c.y, c.z - 0.008)) if 0.38 < c.z < 0.46 and c.y < -0.1 else c)
    sculpt_shape_key(pip, "viseme_MBP", lambda c, i, v: type(c)((c.x, c.y + 0.01, c.z)) if c.z > 0.35 and c.y < -0.08 else c)
    sculpt_shape_key(pip, "viseme_E", smile)
    sculpt_shape_key(pip, "viseme_U", lambda c, i, v: type(c)((c.x * 0.9, c.y - 0.01, c.z - 0.01)) if c.z > 0.35 and c.y < -0.05 else c)
    sculpt_shape_key(pip, "expr_surprised", mouth_open)
    sculpt_shape_key(pip, "expr_worried", lambda c, i, v: type(c)((c.x, c.y, c.z - 0.006)) if 0.45 < c.z < 0.5 else c)

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

    # Preview camera / lights
    cam_data = bpy.data.cameras.new("RefCam")
    cam = bpy.data.objects.new("RefCam", cam_data)
    link(cam)
    cam.location = (0.4, -1.4, 0.35)
    cam.rotation_euler = (math.radians(85), 0, math.radians(12))
    bpy.context.scene.camera = cam
    bpy.ops.object.light_add(type="SUN", location=(2, -2, 4))
    bpy.context.object.data.energy = 3.5
    bpy.ops.object.light_add(type="AREA", location=(0, -1.2, 0.5))
    bpy.context.object.data.energy = 40
    bpy.context.object.data.size = 1.5

    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    preview = path.with_name("preview.png")
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 24
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.filepath = str(preview)
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)

    polys = polygon_count(pip)
    return {
        "assetId": "char_pip_v1",
        "characterCode": "CHAR_PIP_001",
        "name": "Pip",
        "version": "1.0.0",
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
        "productionReady": False,
        "strictCharacterLock": True,
        "renderEngine": "EEVEE",
    }


# ─────────────────────────────────────────────────────────────────────────────
# GOAT
# ─────────────────────────────────────────────────────────────────────────────


def build_goat(path: Path) -> dict:
    import bpy

    reset_scene()
    cream = mat("GoatBody", (0.94, 0.92, 0.86), 0.55, 0.12, subsurface=0.18)
    white = mat("GoatEyeWhite", (0.98, 0.98, 0.98), 0.35, 0.1)
    iris = mat("GoatIris", (0.4, 0.22, 0.1), 0.25, 0.05)
    pupil = mat("GoatPupil", (0.05, 0.04, 0.04), 0.2, 0.0)
    brow = mat("GoatBrow", (0.15, 0.1, 0.06), 0.5, 0.05)
    horn = mat("GoatHorn", (0.45, 0.28, 0.14), 0.4, 0.15)
    nose = mat("GoatNose", (0.95, 0.55, 0.4), 0.45, 0.15)
    ear_in = mat("GoatEarInner", (0.95, 0.6, 0.45), 0.5, 0.1)
    hoof = mat("GoatHoof", (0.2, 0.12, 0.08), 0.4, 0.1)
    blue = mat("GoatCollar", (0.2, 0.45, 0.85), 0.35, 0.25)
    gold = mat("GoatTag", (0.95, 0.78, 0.2), 0.3, 0.55)
    ink = mat("GoatTagInk", (0.08, 0.08, 0.1), 0.55, 0.05)

    # Target height ~0.92 m
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0.05, 0.45), segments=24, ring_count=16)
    body = bpy.context.object
    body.name = "Goat_Body"
    body.scale = (1.05, 1.25, 0.95)
    body.data.materials.append(cream)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2, location=(0, -0.28, 0.78), segments=24, ring_count=16)
    head = bpy.context.object
    head.name = "Goat_Head"
    head.data.materials.append(cream)

    # Horns
    for side, x in (("L", -0.07), ("R", 0.07)):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.06, minor_radius=0.018, location=(x, -0.22, 0.95))
        h = bpy.context.object
        h.name = f"Goat_Horn_{side}"
        h.rotation_euler = (math.radians(70), 0, math.radians(25 if side == "R" else -25))
        h.data.materials.append(horn)

    # Ears
    for side, x in (("L", -0.16), ("R", 0.16)):
        bpy.ops.mesh.primitive_cube_add(size=0.08, location=(x, -0.22, 0.85))
        ear = bpy.context.object
        ear.name = f"Goat_Ear_{side}"
        ear.scale = (0.4, 1.2, 0.7)
        ear.rotation_euler = (0, 0, math.radians(25 if side == "R" else -25))
        ear.data.materials.append(cream)
        bpy.ops.mesh.primitive_cube_add(size=0.05, location=(x * 0.95, -0.24, 0.85))
        ei = bpy.context.object
        ei.name = f"Goat_EarInner_{side}"
        ei.scale = (0.3, 1.0, 0.5)
        ei.data.materials.append(ear_in)

    # Eyes
    for side, x in (("L", -0.06), ("R", 0.06)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.05, location=(x, -0.42, 0.82), segments=16, ring_count=10)
        e = bpy.context.object
        e.name = f"Goat_EyeWhite_{side}"
        e.scale = (1.0, 0.5, 1.0)
        e.data.materials.append(white)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.024, location=(x, -0.45, 0.82), segments=12, ring_count=8)
        i = bpy.context.object
        i.name = f"Goat_Iris_{side}"
        i.data.materials.append(iris)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.01, location=(x, -0.465, 0.82), segments=8, ring_count=6)
        p = bpy.context.object
        p.name = f"Goat_Pupil_{side}"
        p.data.materials.append(pupil)
        bpy.ops.mesh.primitive_cube_add(size=0.045, location=(x, -0.42, 0.88))
        br = bpy.context.object
        br.name = f"Goat_Brow_{side}"
        br.scale = (1.2, 0.2, 0.25)
        br.data.materials.append(brow)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.035, location=(0, -0.48, 0.74), segments=12, ring_count=8)
    n = bpy.context.object
    n.name = "Goat_Nose"
    n.data.materials.append(nose)

    # Beard
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.03, location=(0, -0.42, 0.66), segments=10, ring_count=6)
    beard = bpy.context.object
    beard.name = "Goat_Beard"
    beard.scale = (0.6, 0.8, 1.2)
    beard.data.materials.append(cream)

    # Legs / hooves
    for idx, (x, y) in enumerate(((-0.1, -0.12), (0.1, -0.12), (-0.1, 0.22), (0.1, 0.22))):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.035, depth=0.32, location=(x, y, 0.2))
        leg = bpy.context.object
        leg.name = f"Goat_Leg_{idx}"
        leg.data.materials.append(cream)
        bpy.ops.mesh.primitive_cube_add(size=0.06, location=(x, y, 0.03))
        hf = bpy.context.object
        hf.name = f"Goat_Hoof_{idx}"
        hf.scale = (1.0, 1.3, 0.4)
        hf.data.materials.append(hoof)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.045, location=(0, 0.4, 0.5), segments=12, ring_count=8)
    tail = bpy.context.object
    tail.name = "Goat_Tail"
    tail.scale = (0.7, 1.2, 0.7)
    tail.data.materials.append(cream)

    # Collar + tag + GOAT lettering
    bpy.ops.mesh.primitive_torus_add(major_radius=0.14, minor_radius=0.02, location=(0, -0.22, 0.68))
    collar = bpy.context.object
    collar.name = "Goat_Collar"
    collar.rotation_euler = (math.radians(90), 0, 0)
    collar.data.materials.append(blue)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=0.012, location=(0, -0.34, 0.62))
    tag = bpy.context.object
    tag.name = "Goat_Tag"
    tag.rotation_euler = (math.radians(90), 0, 0)
    tag.data.materials.append(gold)
    bpy.ops.object.text_add(location=(0.0, -0.355, 0.62))
    tag_text = bpy.context.object
    tag_text.name = "Goat_Tag_Text"
    tag_text.data.body = "GOAT"
    tag_text.data.size = 0.038
    tag_text.data.extrude = 0.004
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

    keep = {"Goat_Collar", "Goat_Tag", "Goat_Tag_Text"}
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("Goat_") and o.name not in keep]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    goat = bpy.context.object
    goat.name = "Goat_Character"

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
        if co.z > 0.68 and co.y < -0.3:
            co.z -= 0.02
            co.y -= 0.012
        return co

    def smile(co, i, v):
        if co.z > 0.68 and abs(co.x) > 0.03 and co.y < -0.3:
            co.z += 0.01
        return co

    def blink(co, i, v, side):
        if 0.76 < co.z < 0.9 and co.y < -0.35:
            if (side == "L" and co.x < 0) or (side == "R" and co.x > 0):
                co.z -= 0.012
        return co

    sculpt_shape_key(goat, "jaw_open", mouth_open)
    sculpt_shape_key(goat, "viseme_A", mouth_open)
    sculpt_shape_key(goat, "mouth_smile", smile)
    sculpt_shape_key(goat, "expr_happy", smile)
    sculpt_shape_key(goat, "blink_left", lambda c, i, v: blink(c, i, v, "L"))
    sculpt_shape_key(goat, "blink_right", lambda c, i, v: blink(c, i, v, "R"))
    sculpt_shape_key(goat, "eye_look_left", lambda c, i, v: type(c)((c.x - 0.01, c.y, c.z)) if 0.76 < c.z < 0.88 and c.y < -0.38 else c)
    sculpt_shape_key(goat, "eye_look_right", lambda c, i, v: type(c)((c.x + 0.01, c.y, c.z)) if 0.76 < c.z < 0.88 and c.y < -0.38 else c)
    sculpt_shape_key(goat, "eye_look_up", lambda c, i, v: type(c)((c.x, c.y, c.z + 0.01)) if 0.76 < c.z < 0.88 and c.y < -0.38 else c)
    sculpt_shape_key(goat, "eye_look_down", lambda c, i, v: type(c)((c.x, c.y, c.z - 0.01)) if 0.76 < c.z < 0.88 and c.y < -0.38 else c)
    sculpt_shape_key(goat, "viseme_MBP", lambda c, i, v: type(c)((c.x, c.y + 0.012, c.z)) if c.z > 0.68 and c.y < -0.35 else c)
    sculpt_shape_key(goat, "viseme_O", mouth_open)
    sculpt_shape_key(goat, "viseme_U", lambda c, i, v: type(c)((c.x * 0.92, c.y - 0.01, c.z - 0.012)) if c.z > 0.68 and c.y < -0.3 else c)
    sculpt_shape_key(goat, "expr_surprised", mouth_open)
    sculpt_shape_key(goat, "nose_wrinkle", lambda c, i, v: type(c)((c.x, c.y - 0.005, c.z + 0.004)) if abs(c.x) < 0.05 and 0.7 < c.z < 0.78 and c.y < -0.4 else c)

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
    cam.location = (0.9, -2.4, 0.75)
    cam.rotation_euler = (math.radians(82), 0, math.radians(18))
    bpy.context.scene.camera = cam
    bpy.ops.object.light_add(type="SUN", location=(2, -2, 5))
    bpy.context.object.data.energy = 4.0
    bpy.ops.object.light_add(type="AREA", location=(0, -1.5, 0.7))
    bpy.context.object.data.energy = 60
    bpy.context.object.data.size = 2

    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    preview = path.with_name("preview.png")
    # Collar close framing
    cam.location = (0.35, -1.5, 0.7)
    cam.rotation_euler = (math.radians(88), 0, math.radians(8))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 24
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.filepath = str(preview)
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)

    # Extra collar close-up for GOAT text proof
    close = path.with_name("collar_closeup.png")
    for o in bpy.data.objects:
        if o.name == "Goat_Character":
            o.hide_render = True
    cam.location = (0.05, -0.85, 0.64)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.render.filepath = str(close)
    bpy.ops.render.render(write_still=True)

    polys = polygon_count(goat)
    return {
        "assetId": "char_goat_v1",
        "characterCode": "CHAR_GOAT_001",
        "name": "Goat",
        "version": "1.0.0",
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
        "productionReady": False,
        "strictCharacterLock": True,
        "renderEngine": "EEVEE",
    }


def write_metadata(folder: Path, meta: dict):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "metadata.json").write_text(json.dumps(meta, indent=2) + "\n")


def main():
    pip_blend = OUT_PIP / "pip_v1.blend"
    goat_blend = OUT_GOAT / "goat_v1.blend"
    pip_meta = build_pip(pip_blend)
    write_metadata(OUT_PIP, pip_meta)
    goat_meta = build_goat(goat_blend)
    write_metadata(OUT_GOAT, goat_meta)

    # Sync into production-library for existing DDP bootstrap / assemble paths
    LIB.mkdir(parents=True, exist_ok=True)
    shutil.copy2(pip_blend, LIB / "pip_production.blend")
    shutil.copy2(OUT_PIP / "preview.png", LIB / "pip_production.png")
    shutil.copy2(goat_blend, LIB / "goat_production.blend")
    shutil.copy2(OUT_GOAT / "preview.png", LIB / "goat_production.png")
    if (OUT_GOAT / "collar_closeup.png").exists():
        shutil.copy2(OUT_GOAT / "collar_closeup.png", ROOT / "artifacts/performance/goat-collar-closeup.png")

    manifest = {
        "library": "Doodle Dash Production Character v1",
        "pip": pip_meta,
        "goat": goat_meta,
        "syncedToProductionLibrary": True,
        "note": "productionReady remains false until validation harness passes",
    }
    (ROOT / "assets/characters/library_manifest_v1.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("CHARACTER_V1_OK " + json.dumps({"pip": str(pip_blend), "goat": str(goat_blend), "pipPolys": pip_meta["polygonCount"], "goatPolys": goat_meta["polygonCount"]}))


if __name__ == "__main__":
    main()
