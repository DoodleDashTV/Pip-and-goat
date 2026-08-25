"""Create a small Goat-like Blender fixture. Never uses the real Goat archive."""

from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def build_fixture(out_dir: Path) -> dict:
    import bpy  # type: ignore

    if "tivvlejoy-assets/characters/CHAR_GOAT_001/source" in out_dir.resolve().as_posix():
        raise RuntimeError("LOCKED_SOURCE_WRITE_FORBIDDEN")
    out_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1.0)
    body = bpy.context.active_object
    body.name = "Goat_Body_GEO"
    body.scale = (0.7, 0.45, 1.25)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mat = bpy.data.materials.new("GoatFur")
    mat.use_nodes = True
    body.data.materials.append(mat)
    if not body.data.uv_layers:
        body.data.uv_layers.new(name="UVMap")
    img = bpy.data.images.new("GoatFurTex", 8, 8)
    img.pixels = [0.62, 0.44, 0.26, 1.0] * 64

    body.shape_key_add(name="Basis", from_mix=False)
    for key_name, axis, delta in (
        ("FACE.blink", "z", -0.01),
        ("FACE.smile", "x", 0.01),
        ("FACE.frown", "x", -0.01),
        ("FACE.mouth_open", "y", 0.01),
        ("FACE.eye_look", "z", 0.01),
        ("VISEME.AI", "y", 0.006),
        ("VISEME.E", "x", 0.006),
        ("VISEME.O", "y", -0.006),
        ("VISEME.MBP", "z", -0.006),
        ("VISEME.FV", "x", -0.006),
    ):
        key = body.shape_key_add(name=key_name, from_mix=False)
        for vertex in key.data[:64]:
            setattr(vertex.co, axis, getattr(vertex.co, axis) + delta)

    arm_data = bpy.data.armatures.new("Goat_RIG")
    armature = bpy.data.objects.new("Goat_RIG", arm_data)
    bpy.context.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    body.select_set(False)
    bpy.ops.object.mode_set(mode="EDIT")
    deform_names = [f"DEF.Goat.{index:02d}" for index in range(10)]
    control_names = ["CTRL.Master", "CTRL.Root", "CTRL.Head", "CTRL.IK.Leg.L", "CTRL.IK.Leg.R", "CTRL.Face"]
    previous = None
    for index, bone_name in enumerate(deform_names + control_names):
        bone = arm_data.edit_bones.new(bone_name)
        if index < len(deform_names):
            z = -1.1 + index * 0.24
            bone.head = (0.0, 0.0, z)
            bone.tail = (0.0, 0.0, z + 0.22)
            bone.use_deform = True
            if previous is not None:
                bone.parent = previous
            previous = bone
        else:
            bone.head = (0.15 * (index - len(deform_names)), -0.2, 0.0)
            bone.tail = (0.15 * (index - len(deform_names)), -0.2, 0.2)
            bone.use_deform = False
    bpy.ops.object.mode_set(mode="OBJECT")

    modifier = body.modifiers.new(name="Goat_RIG", type="ARMATURE")
    modifier.object = armature
    for bone_name in deform_names:
        body.vertex_groups.new(name=bone_name)
    for vertex in body.data.vertices:
        normalized_z = (vertex.co.z + 1.25) / 2.5
        group_index = max(0, min(len(deform_names) - 1, int(normalized_z * len(deform_names))))
        body.vertex_groups[deform_names[group_index]].add([vertex.index], 1.0, "REPLACE")

    armature.animation_data_create()
    action = bpy.data.actions.new("Goat_Idle_Test")
    armature.animation_data.action = action
    pose_bone = armature.pose.bones[deform_names[-1]]
    pose_bone.rotation_mode = "XYZ"
    pose_bone.rotation_euler[2] = -0.08
    pose_bone.keyframe_insert(data_path="rotation_euler", frame=1)
    pose_bone.rotation_euler[2] = 0.08
    pose_bone.keyframe_insert(data_path="rotation_euler", frame=12)
    pose_bone.rotation_euler[2] = -0.08
    pose_bone.keyframe_insert(data_path="rotation_euler", frame=24)
    bpy.context.scene.frame_set(1)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.4, minor_radius=0.05, location=(0.0, 0.0, 1.1))
    collar = bpy.context.active_object
    collar.name = "Goat_Collar_GEO"
    collar.parent = body
    collar.data.materials.append(mat)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.12, location=(0.0, -0.42, 0.92))
    tag = bpy.context.active_object
    tag.name = "Goat_Tag_GEO"
    tag.parent = collar
    tag.data.materials.append(mat)
    cam_data = bpy.data.cameras.new("CHAR_GOAT_001_QA_Camera")
    camera = bpy.data.objects.new("CHAR_GOAT_001_QA_Camera", cam_data)
    camera.location = (0.0, -3.5, 1.2)
    camera.rotation_euler = (1.2, 0.0, 0.0)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    bpy.context.view_layer.objects.active = body
    blend = out_dir / "Goat_FINN.blend"
    fbx = out_dir / "Goat_FINN.fbx"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.fbx(filepath=str(fbx), use_selection=False, add_leaf_bones=False)
    archive = out_dir / "Goat_FINN.synthetic.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as zipped:
        zipped.write(blend, "Goat_FINN.blend")
        zipped.write(fbx, "Goat_FINN.fbx")
    receipt = {
        "kind": "synthetic-goat-like",
        "realGoat": False,
        "blend": str(blend),
        "fbx": str(fbx),
        "zip": str(archive),
        "blendSha256": sha256(blend),
        "zipSha256": sha256(archive),
        "zipBytes": archive.stat().st_size,
        "lockedArchiveSize": 269512136,
        "matchesLockedArchive": False,
    }
    (out_dir / "fixture.receipt.json").write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    print(json.dumps(receipt, sort_keys=True))
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    raw = list(__import__("sys").argv[1:])
    if "--" in raw:
        raw = raw[raw.index("--") + 1 :]
    args = parser.parse_args(raw)
    build_fixture(Path(args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
