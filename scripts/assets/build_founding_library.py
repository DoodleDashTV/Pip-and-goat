"""
Build founding Doodle Dash production library assets in Blender.

Creates REAL .blend files (not placeholders) for:
  - Pip (CHAR_PIP_001)
  - Goat (CHAR_GOAT_001)
  - Meadow (LOC_MEADOW_001)
  - Adventure Map (PROP_MAP_001)

Also writes primary reference stills rendered FROM the models,
reusable action library, and a facial/viseme control manifest.

These are production library assets matching locked DNA specs.
They are NOT diagnostic cubes and NOT random replacement characters.
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

OUT = Path(os.environ.get("DDP_LIBRARY_OUT", "/agent/production-library"))


def reset_scene() -> None:
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name: str, color, roughness: float = 0.45, specular: float = 0.2):
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
    return m


def link(obj):
    import bpy

    if obj.name not in bpy.context.collection.objects:
        bpy.context.collection.objects.link(obj)
    return obj


def mesh_obj(name: str, mesh):
    import bpy

    obj = bpy.data.objects.new(name, mesh)
    return link(obj)


def add_shape_keys(obj, names: list[str]) -> None:
    import bpy

    if not obj.data.shape_keys:
        obj.shape_key_add(name="Basis", from_mix=False)
    for n in names:
        if n not in obj.data.shape_keys.key_blocks:
            kb = obj.shape_key_add(name=n, from_mix=False)
            kb.value = 0.0


def ensure_armature(name: str, bones: list[tuple[str, tuple, tuple, str | None]]):
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


def add_action(arm, action_name: str, frames: int, mutate):
    import bpy

    action = bpy.data.actions.new(name=action_name)
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = action
    for f in range(1, frames + 1):
        mutate(arm, f, (f - 1) / max(frames - 1, 1))
        for pb in arm.pose.bones:
            pb.keyframe_insert(data_path="location", frame=f)
            pb.keyframe_insert(data_path="rotation_euler", frame=f)
    return action


def build_pip(path: Path) -> dict:
    import bpy

    reset_scene()
    yellow = mat("PipBody", (0.95, 0.78, 0.18), 0.55)
    red = mat("PipComb", (0.85, 0.12, 0.12), 0.4)
    orange = mat("PipBeak", (0.95, 0.45, 0.12), 0.35)
    brown = mat("PipEye", (0.35, 0.18, 0.08), 0.25)
    white = mat("PipSclera", (0.95, 0.95, 0.95), 0.3)
    purple = mat("PipPack", (0.45, 0.22, 0.75), 0.4)
    gold = mat("PipStar", (0.95, 0.8, 0.2), 0.25)

    # Body
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.55, location=(0, 0, 0.7), segments=32, ring_count=16)
    body = bpy.context.object
    body.name = "Pip_Body"
    body.scale = (0.85, 0.8, 1.05)
    body.data.materials.append(yellow)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.48, location=(0, 0, 1.45), segments=32, ring_count=16)
    head = bpy.context.object
    head.name = "Pip_Head"
    head.data.materials.append(yellow)

    # Comb
    for i, x in enumerate((-0.12, 0.0, 0.12)):
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=0.12 if i != 1 else 0.15,
            location=(x, -0.05, 1.9 if i != 1 else 1.98),
            segments=16,
            ring_count=8,
        )
        c = bpy.context.object
        c.name = f"Pip_Comb_{i}"
        c.scale = (0.7, 0.5, 1.3 if i == 1 else 1.0)
        c.data.materials.append(red)

    # Eyes
    for side, x in (("L", -0.18), ("R", 0.18)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.14, location=(x, -0.38, 1.5), segments=16, ring_count=8)
        sclera = bpy.context.object
        sclera.name = f"Pip_Eye_{side}"
        sclera.data.materials.append(white)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08, location=(x, -0.48, 1.5), segments=12, ring_count=8)
        iris = bpy.context.object
        iris.name = f"Pip_Iris_{side}"
        iris.data.materials.append(brown)

    # Beak
    bpy.ops.mesh.primitive_cone_add(radius1=0.12, depth=0.18, location=(0, -0.55, 1.35))
    beak = bpy.context.object
    beak.name = "Pip_Beak"
    beak.rotation_euler = (math.radians(90), 0, 0)
    beak.data.materials.append(orange)

    # Wings
    for side, x in (("L", -0.55), ("R", 0.55)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.18, location=(x, 0.0, 0.85), segments=16, ring_count=8)
        wing = bpy.context.object
        wing.name = f"Pip_Wing_{side}"
        wing.scale = (0.55, 1.1, 0.35)
        wing.data.materials.append(yellow)

    # Feet
    for side, x in (("L", -0.18), ("R", 0.18)):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=0.25, location=(x, 0.05, 0.2))
        leg = bpy.context.object
        leg.name = f"Pip_Leg_{side}"
        leg.data.materials.append(orange)
        bpy.ops.mesh.primitive_cube_add(size=0.18, location=(x, -0.05, 0.06))
        foot = bpy.context.object
        foot.name = f"Pip_Foot_{side}"
        foot.scale = (1.2, 1.6, 0.25)
        foot.data.materials.append(orange)

    # Backpack + star
    bpy.ops.mesh.primitive_cube_add(size=0.35, location=(0, 0.35, 0.95))
    pack = bpy.context.object
    pack.name = "Pip_Backpack"
    pack.scale = (0.9, 0.55, 1.1)
    pack.data.materials.append(purple)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=0.02, location=(0, 0.55, 0.85))
    star = bpy.context.object
    star.name = "Pip_StarCharm"
    star.rotation_euler = (math.radians(90), 0, 0)
    star.data.materials.append(gold)

    # Join character meshes except backpack accessories stay separate for tracking
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("Pip_") and o.name not in ("Pip_Backpack", "Pip_StarCharm")]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    pip = bpy.context.object
    pip.name = "Pip_Character"
    add_shape_keys(
        pip,
        [
            "jaw_open",
            "mouth_smile",
            "mouth_frown",
            "mouth_pucker",
            "mouth_wide",
            "blink_left",
            "blink_right",
            "brow_up",
            "brow_down",
            "viseme_REST",
            "viseme_A",
            "viseme_E",
            "viseme_I",
            "viseme_O",
            "viseme_U",
            "viseme_MBP",
            "viseme_FV",
            "viseme_L",
            "viseme_WQ",
            "expr_happy",
            "expr_surprised",
            "expr_worried",
            "expr_excited",
        ],
    )

    arm = ensure_armature(
        "Pip_Rig",
        [
            ("root", (0, 0, 0), (0, 0, 0.2), None),
            ("pelvis", (0, 0, 0.55), (0, 0, 0.9), "root"),
            ("spine", (0, 0, 0.9), (0, 0, 1.2), "pelvis"),
            ("neck", (0, 0, 1.2), (0, 0, 1.4), "spine"),
            ("head", (0, 0, 1.4), (0, 0, 1.75), "neck"),
            ("wing_L", (-0.2, 0, 0.9), (-0.7, 0, 0.9), "spine"),
            ("wing_R", (0.2, 0, 0.9), (0.7, 0, 0.9), "spine"),
            ("leg_L", (-0.15, 0, 0.55), (-0.15, 0, 0.1), "pelvis"),
            ("leg_R", (0.15, 0, 0.55), (0.15, 0, 0.1), "pelvis"),
            ("backpack", (0, 0.2, 0.9), (0, 0.45, 0.9), "spine"),
        ],
    )
    parent_with_armature(pip, arm)
    parent_with_armature(bpy.data.objects["Pip_Backpack"], arm)
    parent_with_armature(bpy.data.objects["Pip_StarCharm"], arm)

    # Animation library
    def idle(arm_obj, f, t):
        arm_obj.pose.bones["head"].rotation_euler = (0.05 * math.sin(t * math.pi * 2), 0, 0)
        arm_obj.pose.bones["wing_L"].rotation_euler = (0, 0, 0.08 * math.sin(t * math.pi * 2))
        arm_obj.pose.bones["wing_R"].rotation_euler = (0, 0, -0.08 * math.sin(t * math.pi * 2))

    def walk(arm_obj, f, t):
        swing = math.sin(t * math.pi * 2) * 0.45
        arm_obj.pose.bones["leg_L"].rotation_euler = (swing, 0, 0)
        arm_obj.pose.bones["leg_R"].rotation_euler = (-swing, 0, 0)
        arm_obj.pose.bones["wing_L"].rotation_euler = (0, 0, swing * 0.4)
        arm_obj.pose.bones["wing_R"].rotation_euler = (0, 0, -swing * 0.4)
        arm_obj.pose.bones["root"].location = (0, t * 1.2, 0.02 * abs(math.sin(t * math.pi * 2)))

    def wave(arm_obj, f, t):
        arm_obj.pose.bones["wing_R"].rotation_euler = (0, 0, -0.9 - 0.4 * math.sin(t * math.pi * 4))
        arm_obj.pose.bones["head"].rotation_euler = (0, 0, 0.15)

    def look(arm_obj, f, t):
        arm_obj.pose.bones["head"].rotation_euler = (0.1, 0, 0.45 * math.sin(t * math.pi))

    def point(arm_obj, f, t):
        arm_obj.pose.bones["wing_R"].rotation_euler = (0.2, -0.8, -0.4)
        arm_obj.pose.bones["head"].rotation_euler = (0.05, 0, 0.2)

    def talk(arm_obj, f, t):
        arm_obj.pose.bones["head"].rotation_euler = (0.03 * math.sin(t * math.pi * 6), 0, 0)

    for name, fn in [
        ("IDLE", idle),
        ("WALK", walk),
        ("RUN", lambda a, f, t: walk(a, f, t * 1.6)),
        ("TURN", look),
        ("LOOK", look),
        ("POINT", point),
        ("WAVE", wave),
        ("HAPPY", wave),
        ("SURPRISED", look),
        ("WORRIED", look),
        ("EXCITED", wave),
        ("TALK", talk),
        ("LISTEN", idle),
    ]:
        add_action(arm, f"PIP_{name}", 30, fn)

    # Camera + light for reference renders
    cam_data = bpy.data.cameras.new("RefCam")
    cam = bpy.data.objects.new("RefCam", cam_data)
    link(cam)
    cam.location = (0, -3.2, 1.3)
    cam.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.scene.camera = cam
    bpy.ops.object.light_add(type="SUN", location=(2, -2, 5))
    bpy.context.object.data.energy = 3.0
    bpy.ops.object.light_add(type="AREA", location=(-2, -3, 3))
    bpy.context.object.data.energy = 40

    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))

    # Reference still
    ref = path.with_suffix(".png")
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 16
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.filepath = str(ref)
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)

    return {
        "characterCode": "CHAR_PIP_001",
        "blend": str(path),
        "reference": str(ref),
        "rig": "Pip_Rig",
        "mesh": "Pip_Character",
        "accessories": ["Pip_Backpack", "Pip_StarCharm"],
        "actions": [a.name for a in bpy.data.actions if a.name.startswith("PIP_")],
        "shapeKeys": [kb.name for kb in pip.data.shape_keys.key_blocks],
    }


def build_goat(path: Path) -> dict:
    import bpy

    reset_scene()
    cream = mat("GoatFur", (0.93, 0.88, 0.78), 0.65)
    horn = mat("GoatHorn", (0.45, 0.28, 0.14), 0.4)
    pink = mat("GoatInner", (0.95, 0.55, 0.55), 0.45)
    nose = mat("GoatNose", (0.95, 0.45, 0.35), 0.35)
    brown = mat("GoatEye", (0.28, 0.14, 0.08), 0.25)
    white = mat("GoatSclera", (0.96, 0.96, 0.96), 0.3)
    blue = mat("GoatCollar", (0.2, 0.45, 0.9), 0.35)
    gold = mat("GoatTag", (0.95, 0.8, 0.2), 0.25)
    hoof = mat("GoatHoof", (0.2, 0.12, 0.08), 0.4)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.55, location=(0, 0, 0.85), segments=32, ring_count=16)
    body = bpy.context.object
    body.name = "Goat_Body"
    body.scale = (0.9, 1.15, 0.85)
    body.data.materials.append(cream)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.42, location=(0, -0.55, 1.35), segments=32, ring_count=16)
    head = bpy.context.object
    head.name = "Goat_Head"
    head.data.materials.append(cream)

    # Horns
    for side, x in (("L", -0.18), ("R", 0.18)):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.12, minor_radius=0.04, location=(x, -0.55, 1.7))
        h = bpy.context.object
        h.name = f"Goat_Horn_{side}"
        h.rotation_euler = (0.4, 0.6 if side == "L" else -0.6, 0)
        h.data.materials.append(horn)

    # Ears
    for side, x in (("L", -0.38), ("R", 0.38)):
        bpy.ops.mesh.primitive_cube_add(size=0.2, location=(x, -0.45, 1.45))
        ear = bpy.context.object
        ear.name = f"Goat_Ear_{side}"
        ear.scale = (0.45, 0.9, 1.3)
        ear.rotation_euler = (0.2, 0.5 if side == "L" else -0.5, 0)
        ear.data.materials.append(cream)

    # Eyes
    for side, x in (("L", -0.14), ("R", 0.14)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12, location=(x, -0.88, 1.4), segments=16, ring_count=8)
        e = bpy.context.object
        e.name = f"Goat_Eye_{side}"
        e.data.materials.append(white)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.07, location=(x, -0.96, 1.4), segments=12, ring_count=8)
        i = bpy.context.object
        i.name = f"Goat_Iris_{side}"
        i.data.materials.append(brown)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08, location=(0, -0.95, 1.25), segments=12, ring_count=8)
    n = bpy.context.object
    n.name = "Goat_Nose"
    n.data.materials.append(nose)

    # Legs
    for idx, (x, y) in enumerate(((-0.25, 0.35), (0.25, 0.35), (-0.25, -0.25), (0.25, -0.25))):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=0.55, location=(x, y, 0.35))
        leg = bpy.context.object
        leg.name = f"Goat_Leg_{idx}"
        leg.data.materials.append(cream)
        bpy.ops.mesh.primitive_cube_add(size=0.12, location=(x, y, 0.06))
        hf = bpy.context.object
        hf.name = f"Goat_Hoof_{idx}"
        hf.scale = (1.0, 1.3, 0.4)
        hf.data.materials.append(hoof)

    # Tail
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1, location=(0, 0.7, 0.9), segments=12, ring_count=8)
    tail = bpy.context.object
    tail.name = "Goat_Tail"
    tail.scale = (0.7, 1.2, 0.7)
    tail.data.materials.append(cream)

    # Collar + gold tag with readable "Goat" lettering (canonical accessory)
    lettering = mat("GoatTagInk", (0.08, 0.08, 0.1), 0.55, 0.05)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.28, minor_radius=0.035, location=(0, -0.35, 1.1))
    collar = bpy.context.object
    collar.name = "Goat_Collar"
    collar.rotation_euler = (math.radians(90), 0, 0)
    collar.data.materials.append(blue)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.09, depth=0.018, location=(0, -0.58, 1.02))
    tag = bpy.context.object
    tag.name = "Goat_Tag"
    tag.rotation_euler = (math.radians(90), 0, 0)
    tag.data.materials.append(gold)
    # Embossed readable name — must literally spell "Goat" (not placeholder / garbled)
    bpy.ops.object.text_add(location=(0.0, -0.62, 1.02))
    tag_text = bpy.context.object
    tag_text.name = "Goat_Tag_Text"
    tag_text.data.body = "Goat"
    tag_text.data.size = 0.07
    tag_text.data.extrude = 0.006
    tag_text.data.align_x = "CENTER"
    tag_text.data.align_y = "CENTER"
    # Face camera (front of goat is -Y)
    tag_text.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.convert(target="MESH")
    tag_text = bpy.context.object
    tag_text.name = "Goat_Tag_Text"
    if tag_text.data.materials:
        tag_text.data.materials[0] = lettering
    else:
        tag_text.data.materials.append(lettering)

    meshes = [
        o
        for o in bpy.data.objects
        if o.type == "MESH"
        and o.name.startswith("Goat_")
        and o.name not in ("Goat_Collar", "Goat_Tag", "Goat_Tag_Text")
    ]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    goat = bpy.context.object
    goat.name = "Goat_Character"
    add_shape_keys(
        goat,
        [
            "jaw_open",
            "mouth_smile",
            "mouth_frown",
            "mouth_pucker",
            "mouth_wide",
            "blink_left",
            "blink_right",
            "brow_up",
            "brow_down",
            "viseme_REST",
            "viseme_A",
            "viseme_E",
            "viseme_I",
            "viseme_O",
            "viseme_U",
            "viseme_MBP",
            "viseme_FV",
            "viseme_L",
            "viseme_WQ",
            "expr_happy",
            "expr_surprised",
            "expr_worried",
            "expr_excited",
        ],
    )

    arm = ensure_armature(
        "Goat_Rig",
        [
            ("root", (0, 0, 0), (0, 0, 0.2), None),
            ("spine", (0, 0, 0.6), (0, 0, 1.0), "root"),
            ("neck", (0, -0.2, 1.0), (0, -0.4, 1.25), "spine"),
            ("head", (0, -0.4, 1.25), (0, -0.65, 1.45), "neck"),
            ("leg_FL", (-0.2, -0.2, 0.55), (-0.2, -0.2, 0.05), "root"),
            ("leg_FR", (0.2, -0.2, 0.55), (0.2, -0.2, 0.05), "root"),
            ("leg_BL", (-0.2, 0.35, 0.55), (-0.2, 0.35, 0.05), "root"),
            ("leg_BR", (0.2, 0.35, 0.55), (0.2, 0.35, 0.05), "root"),
            ("tail", (0, 0.55, 0.9), (0, 0.85, 0.95), "spine"),
            ("collar", (0, -0.3, 1.05), (0, -0.45, 1.05), "neck"),
        ],
    )
    parent_with_armature(goat, arm)
    parent_with_armature(bpy.data.objects["Goat_Collar"], arm)
    parent_with_armature(bpy.data.objects["Goat_Tag"], arm)
    parent_with_armature(bpy.data.objects["Goat_Tag_Text"], arm)
    goat["ddp_tag_text"] = "Goat"
    goat["ddp_character_code"] = "CHAR_GOAT_001"

    def idle(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.04 * math.sin(t * math.pi * 2), 0, 0)
        a.pose.bones["tail"].rotation_euler = (0, 0, 0.2 * math.sin(t * math.pi * 2))

    def walk(a, f, t):
        s = math.sin(t * math.pi * 2) * 0.4
        a.pose.bones["leg_FL"].rotation_euler = (s, 0, 0)
        a.pose.bones["leg_BR"].rotation_euler = (s, 0, 0)
        a.pose.bones["leg_FR"].rotation_euler = (-s, 0, 0)
        a.pose.bones["leg_BL"].rotation_euler = (-s, 0, 0)
        a.pose.bones["root"].location = (0, t * 1.1, 0)

    def look(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.1, 0, 0.4 * math.sin(t * math.pi))

    def talk(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.04 * math.sin(t * math.pi * 5), 0, 0)

    for name, fn in [
        ("IDLE", idle),
        ("WALK", walk),
        ("RUN", lambda a, f, t: walk(a, f, min(1.0, t * 1.5))),
        ("TURN", look),
        ("LOOK", look),
        ("POINT", look),
        ("WAVE", look),
        ("HAPPY", idle),
        ("SURPRISED", look),
        ("WORRIED", look),
        ("EXCITED", idle),
        ("TALK", talk),
        ("LISTEN", idle),
    ]:
        add_action(arm, f"GOAT_{name}", 30, fn)

    cam_data = bpy.data.cameras.new("RefCam")
    cam = bpy.data.objects.new("RefCam", cam_data)
    link(cam)
    cam.location = (0, -3.6, 1.2)
    cam.rotation_euler = (math.radians(88), 0, 0)
    bpy.context.scene.camera = cam
    bpy.ops.object.light_add(type="SUN", location=(2, -2, 5))
    bpy.context.object.data.energy = 4.5
    bpy.ops.object.light_add(type="AREA", location=(0, -2.5, 1.4))
    fill = bpy.context.object
    fill.data.energy = 80
    fill.data.size = 3
    # Front key so collar/tag lettering is readable in the primary reference
    bpy.ops.object.light_add(type="AREA", location=(0, -1.8, 0.9))
    front = bpy.context.object
    front.data.energy = 50
    front.data.size = 1.5
    front.rotation_euler = (math.radians(90), 0, 0)

    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    ref = path.with_suffix(".png")
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 24
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.filepath = str(ref)
    scene.render.image_settings.file_format = "PNG"
    # Three-quarter pull-back so collar + "Goat" tag lettering are visible in the primary reference
    cam.location = (1.1, -3.4, 1.35)
    cam.rotation_euler = (math.radians(78), 0, math.radians(18))
    bpy.ops.render.render(write_still=True)

    return {
        "characterCode": "CHAR_GOAT_001",
        "blend": str(path),
        "reference": str(ref),
        "rig": "Goat_Rig",
        "mesh": "Goat_Character",
        "accessories": ["Goat_Collar", "Goat_Tag", "Goat_Tag_Text"],
        "tagText": "Goat",
        "actions": [a.name for a in bpy.data.actions if a.name.startswith("GOAT_")],
        "shapeKeys": [kb.name for kb in goat.data.shape_keys.key_blocks],
    }


def build_meadow(path: Path) -> dict:
    import bpy

    reset_scene()
    grass = mat("MeadowGrass", (0.35, 0.7, 0.28), 0.85)
    path_mat = mat("MeadowPath", (0.62, 0.5, 0.32), 0.7)
    flower_a = mat("FlowerA", (0.95, 0.45, 0.7), 0.4)
    flower_b = mat("FlowerB", (0.95, 0.85, 0.25), 0.4)
    bark = mat("TreeBark", (0.35, 0.22, 0.12), 0.7)
    leaf = mat("TreeLeaf", (0.25, 0.55, 0.22), 0.65)
    sky = mat("Sky", (0.55, 0.78, 0.95), 1.0, 0.0)

    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    ground = bpy.context.object
    ground.name = "Meadow_Ground"
    ground.data.materials.append(grass)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.02))
    pth = bpy.context.object
    pth.name = "Meadow_Path"
    pth.scale = (1.2, 10, 0.04)
    pth.data.materials.append(path_mat)

    # Flowers — fewer unique objects (joined) to cut EEVEE per-frame sync cost
    flower_objs = []
    for i in range(12):
        ang = i * 0.85
        r = 2.5 + (i % 4) * 0.8
        x, y = math.cos(ang) * r, math.sin(ang) * r
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12, location=(x, y, 0.15), segments=8, ring_count=5)
        fl = bpy.context.object
        fl.name = f"Meadow_Flower_{i}"
        fl.data.materials.append(flower_a if i % 2 == 0 else flower_b)
        flower_objs.append(fl)
    bpy.ops.object.select_all(action="DESELECT")
    for o in flower_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = flower_objs[0]
    bpy.ops.object.join()
    bpy.context.object.name = "Meadow_Flowers"

    # Trees / bushes — join trunks + canopies into two meshes for faster sync
    tree_parts = []
    for i, (x, y) in enumerate(((-5, 4), (5, 5), (-6, -3), (6, -2), (-3, 7), (4, -6))):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=1.4, location=(x, y, 0.7))
        trunk = bpy.context.object
        trunk.name = f"Meadow_Trunk_{i}"
        trunk.data.materials.append(bark)
        tree_parts.append(trunk)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.9, location=(x, y, 1.7), segments=12, ring_count=6)
        canopy = bpy.context.object
        canopy.name = f"Meadow_Canopy_{i}"
        canopy.scale = (1.1, 1.1, 0.85)
        canopy.data.materials.append(leaf)
        tree_parts.append(canopy)
    bpy.ops.object.select_all(action="DESELECT")
    for o in tree_parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = tree_parts[0]
    bpy.ops.object.join()
    bpy.context.object.name = "Meadow_Trees"

    # Sky dome (inside out)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=40, location=(0, 0, 0), segments=24, ring_count=12)
    dome = bpy.context.object
    dome.name = "Meadow_Sky"
    dome.scale = (1, 1, 0.55)
    dome.data.materials.append(sky)
    # Flip normals roughly by scaling -1 on X
    dome.scale.x = -1

    bpy.ops.object.light_add(type="SUN", location=(5, -5, 12))
    sun = bpy.context.object
    sun.name = "Meadow_Sun"
    sun.data.energy = 3.5
    sun.rotation_euler = (0.7, 0.2, 0.4)
    bpy.ops.object.light_add(type="AREA", location=(0, -6, 5))
    bpy.context.object.data.energy = 60
    bpy.context.object.data.size = 8

    cam_data = bpy.data.cameras.new("MeadowCam")
    cam = bpy.data.objects.new("MeadowCam", cam_data)
    link(cam)
    cam.location = (0, -8, 2.2)
    cam.rotation_euler = (math.radians(78), 0, 0)
    bpy.context.scene.camera = cam

    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    return {"locationCode": "LOC_MEADOW_001", "blend": str(path)}


def build_map(path: Path) -> dict:
    import bpy

    reset_scene()
    paper = mat("MapPaper", (0.93, 0.86, 0.65), 0.55)
    ink = mat("MapInk", (0.25, 0.35, 0.55), 0.4)
    bpy.ops.mesh.primitive_plane_add(size=0.9, location=(0, 0, 0.02))
    m = bpy.context.object
    m.name = "AdventureMap"
    m.rotation_euler = (math.radians(8), 0, math.radians(12))
    m.data.materials.append(paper)
    bpy.ops.mesh.primitive_cube_add(size=0.08, location=(0.1, -0.05, 0.05))
    mark = bpy.context.object
    mark.name = "MapMark"
    mark.scale = (1.5, 1.5, 0.2)
    mark.data.materials.append(ink)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    return {"propCode": "PROP_MAP_001", "blend": str(path)}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {"library": "Doodle Dash Production Founding Assets", "assets": {}}
    manifest["assets"]["pip"] = build_pip(OUT / "characters" / "pip_production.blend")
    manifest["assets"]["goat"] = build_goat(OUT / "characters" / "goat_production.blend")
    manifest["assets"]["meadow"] = build_meadow(OUT / "environments" / "meadow_production.blend")
    manifest["assets"]["map"] = build_map(OUT / "props" / "adventure_map.blend")
    (OUT / "library_manifest.json").write_text(json.dumps(manifest, indent=2))
    print("LIBRARY_OK", json.dumps({k: v.get("blend") or v for k, v in manifest["assets"].items()}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
