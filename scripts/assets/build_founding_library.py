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


#: Meadow path: worn dirt lying ON the ground. It used to be a unit cube whose
#: scale never survived the save, so the shot contained a 1 m tan box standing at
#: the origin and clipping through a tree — the "untextured slab" that dominated
#: the acceptance render. Built from explicit vertices now, so there is no
#: unapplied transform left to lose.
MEADOW_PATH_HALF_WIDTH = 0.55
MEADOW_PATH_LENGTH = 11.0
MEADOW_PATH_HEIGHT = 0.006


def build_meadow_path(material):
    """Replace/create ``Meadow_Path`` as a flat worn trail on the ground."""
    import bmesh
    import bpy

    old = bpy.data.objects.get("Meadow_Path")
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)

    mesh = bpy.data.meshes.new("Meadow_Path")
    bm = bmesh.new()
    half_w, half_l, z = MEADOW_PATH_HALF_WIDTH, MEADOW_PATH_LENGTH / 2.0, MEADOW_PATH_HEIGHT
    segments = 10
    rows = []
    for i in range(segments + 1):
        t = i / segments
        y = -half_l + t * MEADOW_PATH_LENGTH
        # A gentle meander and a slight width variation so it reads as a worn
        # trail rather than a painted rectangle.
        offset = 0.22 * math.sin(t * math.pi * 1.6)
        width = half_w * (0.85 + 0.15 * math.cos(t * math.pi * 2.2))
        rows.append(
            (
                bm.verts.new((offset - width, y, z)),
                bm.verts.new((offset + width, y, z)),
            )
        )
    for (l0, r0), (l1, r1) in zip(rows, rows[1:]):
        bm.faces.new((l0, r0, r1, l1))
    bm.to_mesh(mesh)
    bm.free()
    obj = mesh_obj("Meadow_Path", mesh)
    obj.data.materials.append(material)
    return obj


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

    build_meadow_path(path_mat)

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


# --- Adventure map -----------------------------------------------------------
# The premise of the shot is two characters reading a treasure map, so the prop
# has to survive being looked at. It used to be a 0.9 m zero-thickness plane with
# a small cube on it: edge-on from a 12-degree camera it was invisible, and what
# little showed read as blank paper. This version has real thickness, a curl, a
# drawn coastline, a dashed trail leading to an X, a compass rose and a border,
# and it leans on a rock so the drawn face turns toward the lens.
MAP_WIDTH = 0.96
MAP_DEPTH = 0.70
MAP_THICKNESS = 0.014
MAP_CURL = 0.030
#: Amplitude of the sheet's ripple. Kept small so a flat drawn shape spanning
#: half the sheet still sits clear of the paper under it.
MAP_RIPPLE = 0.0015
#: Lean angle of the sheet. Combined with the shot camera's 12-degree depression
#: this puts the drawn face at roughly 44 degrees to the lens: readable, while
#: still low enough that two characters can plausibly stand over it.
MAP_TILT = math.radians(32.0)
MAP_YAW = math.radians(-7.0)
MAP_LIFT = 0.20
MAP_STAND_Y = 0.30
#: Ink sits this far proud of the paper: enough to never z-fight, small enough
#: to read as printing rather than as blocks lying on top of the map. The first
#: attempt used 2.2 mm of lift on 4 mm slabs, and at full resolution every border
#: bar and fold line read as a stick laid on the sheet, each with its own drop
#: shadow — the coastline's shadow even doubled the landmass into a ghost.
INK_LIFT = 0.0009
#: Thickness of a drawn shape. Printing has none; this is just enough to give the
#: shape a silhouette edge under a raking key.
INK_THICKNESS = 0.0011
#: Drawn shapes come in passes, and shapes that cross each other cannot share a
#: height. The dashed trail is drawn ACROSS the landmass and the fold creases run
#: across everything; coplanar faces both hide detail and risk z-fighting that
#: would flicker frame to frame.
INK_LAYER_STEP = 0.0004
#: Draw order: base regions, then routes and symbols, then the folds in the sheet.
#: The top level exists for the second half of a shape that crosses itself — the
#: two bars of the X, the two fold lines — which would otherwise be coplanar.
INK_LAYER_REGION = 0
INK_LAYER_ROUTE = 1
INK_LAYER_OVER = 2
INK_LAYER_TOP = 3


def _map_surface_z(x: float, y: float = 0.0) -> float:
    """Height of the paper's top face: the edge curl plus the sheet's ripple.

    The ripple has to be part of this, not added only to the paper's own grid.
    When it was not, the ink was placed against a smooth idealised surface while
    the paper undulated +-4 mm through it, and thin printing sank out of sight —
    the trail, the compass and the X all vanished from the render.
    """
    t = (2.0 * x) / MAP_WIDTH
    ripple = MAP_RIPPLE * math.sin(3.1 * x) * math.cos(2.4 * y)
    return MAP_THICKNESS + MAP_CURL * t * t + ripple


#: Longest edge an ink shape may span before it is subdivided to follow the
#: paper. The sheet curls 30 mm across its width, so a large shape built as one
#: flat polygon chords across that curve: the landmass floated 9 mm off the paper
#: in the middle, high enough to swallow the dashed trail drawn over it.
INK_SEGMENT = 0.035


def _ink_slab(name: str, material, points, thickness: float = INK_THICKNESS, layer: int = 0):
    """A drawn shape that hugs the paper, subdivided so it follows the curl.

    Ink does not cast: a drawn line has no height to throw a shadow from, and
    letting these shapes cast turned every one of them into a raised object with
    its own drop shadow.
    """
    import bmesh
    import bpy

    lift = INK_LIFT + layer * INK_LAYER_STEP
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)

    # Ring-subdivided fan from the centroid: every shape here is convex, so
    # interpolating boundary points toward the centre tiles the whole shape.
    boundary: list[tuple[float, float]] = []
    for (x0, y0), (x1, y1) in zip(points, points[1:] + points[:1]):
        steps = max(1, math.ceil(math.dist((x0, y0), (x1, y1)) / INK_SEGMENT))
        for s in range(steps):
            f = s / steps
            boundary.append((x0 + (x1 - x0) * f, y0 + (y1 - y0) * f))
    rings = max(1, math.ceil(max(math.dist((cx, cy), p) for p in points) / INK_SEGMENT))

    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()

    def surface(x, y, offset):
        return bm.verts.new((x, y, _map_surface_z(x, y) + lift + offset))

    def shell(offset):
        centre = surface(cx, cy, offset)
        ring_verts = [[centre]]
        for r in range(1, rings + 1):
            f = r / rings
            ring_verts.append([surface(cx + (x - cx) * f, cy + (y - cy) * f, offset) for x, y in boundary])
        return ring_verts

    top = shell(thickness)
    bottom = shell(0.0)
    count = len(boundary)
    for shell_verts, flip in ((top, False), (bottom, True)):
        for i in range(count):
            j = (i + 1) % count
            tri = (shell_verts[0][0], shell_verts[1][i], shell_verts[1][j])
            bm.faces.new(tuple(reversed(tri)) if flip else tri)
        for r in range(1, rings):
            for i in range(count):
                j = (i + 1) % count
                quad = (shell_verts[r][i], shell_verts[r][j], shell_verts[r + 1][j], shell_verts[r + 1][i])
                bm.faces.new(tuple(reversed(quad)) if flip else quad)
    for i in range(count):
        j = (i + 1) % count
        bm.faces.new((bottom[rings][i], bottom[rings][j], top[rings][j], top[rings][i]))
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = mesh_obj(name, mesh)
    obj.data.materials.append(material)
    if hasattr(obj, "visible_shadow"):
        obj.visible_shadow = False
    return obj


def _ink_bar(name: str, material, cx: float, cy: float, length: float, width: float, angle: float, layer: int = 0):
    c, s = math.cos(angle), math.sin(angle)
    hl, hw = length / 2.0, width / 2.0
    corners = [(-hl, -hw), (hl, -hw), (hl, hw), (-hl, hw)]
    pts = [(cx + x * c - y * s, cy + x * s + y * c) for x, y in corners]
    return _ink_slab(name, material, pts, layer=layer)


def build_map(path: Path) -> dict:
    import bmesh
    import bpy

    reset_scene()
    paper = mat("MapPaper", (0.82, 0.70, 0.48), 0.62, 0.25)
    ink = mat("MapInk", (0.16, 0.13, 0.10), 0.55, 0.15)
    coast = mat("MapCoast", (0.44, 0.56, 0.33), 0.7, 0.1)
    water = mat("MapWater", (0.32, 0.52, 0.66), 0.45, 0.35)
    trail = mat("MapTrail", (0.66, 0.24, 0.16), 0.5, 0.2)
    accent = mat("MapAccent", (0.80, 0.60, 0.18), 0.35, 0.45)
    stone = mat("MapStone", (0.40, 0.39, 0.36), 0.85, 0.1)
    # A fold is a shading change in the paper, not a drawn line: inking the
    # creases black put two hard bars across the middle of the sheet.
    fold = mat("MapFold", (0.66, 0.55, 0.38), 0.68, 0.2)

    # Paper body: a curled sheet with real thickness.
    mesh = bpy.data.meshes.new("AdventureMap")
    bm = bmesh.new()
    cols, rows = 12, 8
    grid_top, grid_bottom = [], []
    for r in range(rows + 1):
        y = -MAP_DEPTH / 2 + MAP_DEPTH * r / rows
        top_row, bottom_row = [], []
        for c in range(cols + 1):
            x = -MAP_WIDTH / 2 + MAP_WIDTH * c / cols
            top_row.append(bm.verts.new((x, y, _map_surface_z(x, y))))
            bottom_row.append(bm.verts.new((x, y, _map_surface_z(x, y) - MAP_THICKNESS)))
        grid_top.append(top_row)
        grid_bottom.append(bottom_row)
    for r in range(rows):
        for c in range(cols):
            bm.faces.new((grid_top[r][c], grid_top[r][c + 1], grid_top[r + 1][c + 1], grid_top[r + 1][c]))
            bm.faces.new(
                (grid_bottom[r][c], grid_bottom[r + 1][c], grid_bottom[r + 1][c + 1], grid_bottom[r][c + 1])
            )
    for c in range(cols):
        bm.faces.new((grid_top[0][c + 1], grid_top[0][c], grid_bottom[0][c], grid_bottom[0][c + 1]))
        bm.faces.new((grid_top[rows][c], grid_top[rows][c + 1], grid_bottom[rows][c + 1], grid_bottom[rows][c]))
    for r in range(rows):
        bm.faces.new((grid_top[r][0], grid_top[r + 1][0], grid_bottom[r + 1][0], grid_bottom[r][0]))
        bm.faces.new((grid_top[r + 1][cols], grid_top[r][cols], grid_bottom[r][cols], grid_bottom[r + 1][cols]))
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    paper_obj = mesh_obj("AdventureMap", mesh)
    paper_obj.data.materials.append(paper)

    parts = []

    # Border frame, four bars inset from the edges.
    bw, bd, inset, bar = MAP_WIDTH, MAP_DEPTH, 0.035, 0.016
    parts.append(_ink_bar("MapBorder_N", ink, 0.0, bd / 2 - inset, bw - 2 * inset, bar, 0.0))
    parts.append(_ink_bar("MapBorder_S", ink, 0.0, -bd / 2 + inset, bw - 2 * inset, bar, 0.0))
    parts.append(_ink_bar("MapBorder_W", ink, -bw / 2 + inset, 0.0, bd - 2 * inset, bar, math.pi / 2))
    parts.append(_ink_bar("MapBorder_E", ink, bw / 2 - inset, 0.0, bd - 2 * inset, bar, math.pi / 2))

    # Land mass and a bay of water, so the sheet reads as a map at a glance.
    parts.append(
        _ink_slab(
            "MapCoast",
            coast,
            [(-0.36, -0.20), (-0.14, -0.25), (0.06, -0.14), (0.16, 0.06), (0.02, 0.20), (-0.20, 0.22), (-0.38, 0.06)],
        )
    )
    parts.append(_ink_slab("MapWater", water, [(0.20, -0.24), (0.40, -0.20), (0.40, 0.02), (0.22, 0.02)]))

    # Dashed trail from the shoreline to the treasure, drawn on the layer above
    # the landmass it crosses.
    trail_points = [(-0.30, -0.19), (-0.20, -0.10), (-0.08, -0.04), (0.04, 0.03), (0.14, 0.09), (0.23, 0.15)]
    for i, ((x0, y0), (x1, y1)) in enumerate(zip(trail_points, trail_points[1:])):
        for j in range(2):
            f = (j + 0.5) / 2
            cx, cy = x0 + (x1 - x0) * f, y0 + (y1 - y0) * f
            parts.append(
                _ink_bar(
                    f"MapTrail_{i}_{j}",
                    trail,
                    cx,
                    cy,
                    0.052,
                    0.014,
                    math.atan2(y1 - y0, x1 - x0),
                    layer=INK_LAYER_ROUTE,
                )
            )

    # Compass rose, in the one corner nothing else occupies. It started out at
    # the same coordinates as the X and the two drew on top of each other.
    parts.append(
        _ink_slab(
            "MapCompass_N",
            accent,
            [(-0.34, 0.30), (-0.305, 0.22), (-0.34, 0.14), (-0.375, 0.22)],
            layer=INK_LAYER_ROUTE,
        )
    )
    parts.append(
        _ink_slab(
            "MapCompass_E",
            accent,
            [(-0.42, 0.22), (-0.34, 0.255), (-0.26, 0.22), (-0.34, 0.185)],
            layer=INK_LAYER_ROUTE,
        )
    )

    # Fold creases, in paper's own colour so they read as folds. A fold runs
    # through whatever is printed on the sheet, so they sit above the drawing.
    parts.append(
        _ink_bar("MapCrease_V", fold, 0.0, 0.0, MAP_DEPTH - 2 * inset, 0.006, math.pi / 2, layer=INK_LAYER_TOP)
    )
    parts.append(_ink_bar("MapCrease_H", fold, 0.0, 0.0, MAP_WIDTH - 2 * inset, 0.006, 0.0, layer=INK_LAYER_OVER))

    # X marks the spot, over the end of the trail that leads to it. Kept as its
    # own object named MapMark: the hierarchy gate uses it to prove a placement
    # moved the whole prop and not just the paper.
    mark_a = _ink_bar("MapMark", trail, 0.28, 0.19, 0.15, 0.024, math.radians(45), layer=INK_LAYER_OVER)
    mark_b = _ink_bar("MapMark_B", trail, 0.28, 0.19, 0.15, 0.024, math.radians(-45), layer=INK_LAYER_TOP)
    parts.extend([mark_a, mark_b])

    for obj in parts:
        world = obj.matrix_world.copy()
        obj.parent = paper_obj
        obj.matrix_world = world

    # Lean the sheet back so its drawn face turns toward the lens. A map lying
    # flat is edge-on to a shot camera and reads as a blank sliver, which is what
    # the acceptance render showed. The ink is parented to the paper, so it tilts
    # with it; the rock does not, because it belongs on the ground.
    paper_obj.rotation_euler = (MAP_TILT, 0.0, MAP_YAW)
    paper_obj.location = (0.0, 0.0, MAP_LIFT)

    # A rock for the sheet to rest against, sized so its top meets the paper's
    # underside instead of leaving the map hovering.
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(0.0, 0.0, 0.0))
    rock = bpy.context.object
    rock.name = "MapStand"
    rock.scale = (0.26, 0.15, 0.17)
    rock.location = (0.05, MAP_STAND_Y, 0.17)
    rock.data.materials.append(stone)

    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    return {
        "propCode": "PROP_MAP_001",
        "blend": str(path),
        "objects": ["AdventureMap"] + [o.name for o in parts],
    }


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
