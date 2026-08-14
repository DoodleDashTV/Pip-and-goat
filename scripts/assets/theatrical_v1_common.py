"""Shared helpers for proposed theatrical v1 assets. Never writes production-library/."""

from __future__ import annotations

import math
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PRODUCTION_LIBRARY = REPO_ROOT / "production-library"
PROPOSED = REPO_ROOT / "theatrical-foundation/proposed/v1"
TEXTURES = PROPOSED / "textures"

# Locked DNA hues (linear-ish display values matching v1.1)
PIP_YELLOW = (1.0, 0.90, 0.12)
PIP_COMB = (0.95, 0.08, 0.12)
PIP_BEAK = (1.0, 0.55, 0.08)
PIP_FEET = (1.0, 0.45, 0.08)
PIP_PURPLE = (0.48, 0.28, 0.78)
PIP_STRAP = (0.38, 0.20, 0.65)
PIP_GOLD = (0.97, 0.80, 0.22)
PIP_IRIS = (0.38, 0.18, 0.06)
GOAT_CREAM = (0.97, 0.95, 0.90)
GOAT_HORN = (0.50, 0.30, 0.14)
GOAT_NOSE = (0.95, 0.45, 0.38)
GOAT_COLLAR = (0.15, 0.42, 0.82)
GOAT_TAG = (0.95, 0.78, 0.22)
GOAT_HOOF = (0.22, 0.12, 0.07)
GOAT_IRIS = (0.32, 0.16, 0.06)
GOAT_EAR_IN = (0.92, 0.62, 0.58)


def assert_not_production_library(path: Path) -> None:
    resolved = path.resolve()
    lib = PRODUCTION_LIBRARY.resolve()
    if resolved == lib or lib in resolved.parents:
        raise PermissionError(f"refusing to write inside production-library/: {path}")


def reset_scene():
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)


def link(obj):
    import bpy

    if obj.name not in bpy.context.collection.objects:
        bpy.context.collection.objects.link(obj)
    return obj


def apply_all(obj):
    import bpy

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def smooth(obj):
    if obj.type != "MESH":
        return
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = True


def principled_mat(
    name,
    color,
    *,
    roughness=0.45,
    specular=0.25,
    subsurface=0.0,
    sheen=0.0,
    metallic=0.0,
    coat=0.0,
    coat_rough=0.1,
    emission=0.0,
):
    import bpy

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if not bsdf:
        return mat
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = roughness
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = metallic
    for key in ("Specular IOR Level", "Specular"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = specular
            break
    for key in ("Subsurface Weight", "Subsurface"):
        if key in bsdf.inputs and subsurface:
            bsdf.inputs[key].default_value = subsurface
            break
    if "Subsurface Radius" in bsdf.inputs and subsurface:
        bsdf.inputs["Subsurface Radius"].default_value = (0.8, 0.45, 0.25)
    for key in ("Sheen Weight", "Sheen"):
        if key in bsdf.inputs and sheen:
            bsdf.inputs[key].default_value = sheen
            break
    for key in ("Coat Weight", "Clearcoat"):
        if key in bsdf.inputs and coat:
            bsdf.inputs[key].default_value = coat
            break
    for key in ("Coat Roughness", "Clearcoat Roughness"):
        if key in bsdf.inputs and coat:
            bsdf.inputs[key].default_value = coat_rough
            break
    if emission and "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = emission
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    return mat


def attach_image_maps(mat, basecolor_path: Path | None, roughness_path: Path | None, normal_path: Path | None):
    import bpy

    if not mat.use_nodes:
        return
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if not bsdf:
        return
    tex_x = -420

    def img_node(path, non_color=False):
        node = nt.nodes.new("ShaderNodeTexImage")
        node.location = (tex_x, 0)
        img = bpy.data.images.load(str(path))
        node.image = img
        if non_color:
            node.image.colorspace_settings.name = "Non-Color"
        return node

    if basecolor_path and basecolor_path.exists():
        node = img_node(basecolor_path)
        nt.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    if roughness_path and roughness_path.exists():
        node = img_node(roughness_path, non_color=True)
        node.location = (tex_x, -260)
        nt.links.new(node.outputs["Color"], bsdf.inputs["Roughness"])
    if normal_path and normal_path.exists() and "Normal" in bsdf.inputs:
        node = img_node(normal_path, non_color=True)
        node.location = (tex_x, -520)
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.location = (tex_x + 220, -520)
        nmap.inputs["Strength"].default_value = 0.35
        nt.links.new(node.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])


def write_variation_maps(stem: str, base_rgb, size=2048):
    """Local 2K maps: locked hue + soft variation. No third-party textures."""
    import numpy as np

    from png_io import write_stored_srgb

    TEXTURES.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(abs(hash(stem)) % (2**32))
    y = np.linspace(0, 1, size, dtype=np.float32)
    x = np.linspace(0, 1, size, dtype=np.float32)
    xx, yy = np.meshgrid(x, y)
    n1 = rng.random((size, size)).astype(np.float32)
    n2 = rng.random((size // 4, size // 4)).astype(np.float32)
    # upsample coarse noise
    coarse = np.kron(n2, np.ones((4, 4), dtype=np.float32))[:size, :size]
    fiber = 0.5 + 0.5 * np.sin((xx * 38 + yy * 6) * math.pi * 2 + coarse * 2)
    mix = 0.72 * coarse + 0.28 * n1
    variation = (mix * 0.12 + fiber * 0.06) - 0.06

    albedo = np.zeros((size, size, 3), dtype=np.uint8)
    for i, ch in enumerate(base_rgb):
        val = np.clip(ch * 255.0 * (1.0 + variation), 0, 255)
        albedo[:, :, i] = val.astype(np.uint8)
    rough = np.clip(140 + variation * 80, 70, 210).astype(np.uint8)
    roughness = np.stack([rough, rough, rough], axis=2)
    # Mild stylized normal: mostly flat, slight fiber
    nx = np.clip(128 + (fiber - 0.5) * 28, 0, 255).astype(np.uint8)
    ny = np.clip(128 + (coarse - 0.5) * 22, 0, 255).astype(np.uint8)
    nz = np.full((size, size), 240, dtype=np.uint8)
    normal = np.stack([nx, ny, nz], axis=2)

    paths = {
        "basecolor": TEXTURES / f"{stem}_basecolor_2k.png",
        "roughness": TEXTURES / f"{stem}_roughness_2k.png",
        "normal": TEXTURES / f"{stem}_normal_2k.png",
    }
    write_stored_srgb(paths["basecolor"], albedo)
    write_stored_srgb(paths["roughness"], roughness)
    write_stored_srgb(paths["normal"], normal)
    return paths


def ensure_uv(obj):
    import bpy

    if obj.type != "MESH":
        return
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=66, island_margin=0.03)
    bpy.ops.object.mode_set(mode="OBJECT")


def voxel_unify(obj, voxel=0.012):
    import bpy

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    remesh = obj.modifiers.new("Unify", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = voxel
    remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier="Unify")
    smooth(obj)


def join_named(names, result_name):
    import bpy

    objs = [bpy.data.objects[n] for n in names if n in bpy.data.objects]
    if not objs:
        raise RuntimeError(f"nothing to join for {result_name}")
    for obj in objs:
        apply_all(obj)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = result_name
    return obj


def add_shape_keys(obj, names):
    if not obj.data.shape_keys:
        obj.shape_key_add(name="Basis", from_mix=False)
    for name in names:
        if name not in obj.data.shape_keys.key_blocks:
            kb = obj.shape_key_add(name=name, from_mix=False)
            kb.value = 0.0


def sculpt_shape_key(obj, key_name, mutate_fn):
    from mathutils import Vector

    keys = obj.data.shape_keys.key_blocks
    if key_name not in keys:
        return
    kb = keys[key_name]
    basis = keys["Basis"]
    for i, vert in enumerate(obj.data.vertices):
        kb.data[i].co = mutate_fn(Vector(basis.data[i].co), i, vert)


def ensure_armature(name, bones):
    import bpy

    arm_data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, arm_data)
    link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    created = {}
    for bname, head, tail, parent in bones:
        bone = arm_data.edit_bones.new(bname)
        bone.head = head
        bone.tail = tail
        if parent and parent in created:
            bone.parent = created[parent]
        created[bname] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def parent_armature(obj, arm, bone=None):
    obj.parent = arm
    if bone:
        obj.parent_type = "BONE"
        obj.parent_bone = bone
        return
    mod = obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm


def heat_weights(obj, arm):
    import bpy

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")


def add_action(arm, name, frames, fn):
    import bpy

    action = bpy.data.actions.new(name=name)
    action.use_fake_user = True
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = action
    for frame in range(1, frames + 1):
        t = (frame - 1) / max(1, frames - 1)
        fn(arm, frame, t)
        for pb in arm.pose.bones:
            pb.keyframe_insert(data_path="location", frame=frame)
            pb.keyframe_insert(data_path="rotation_euler", frame=frame)
    arm.animation_data.action = None
    return action


def append_canonical_actions(blend_path: Path, prefix: str):
    import bpy

    with bpy.data.libraries.load(str(blend_path), link=False) as (src, dst):
        dst.actions = [name for name in src.actions if name.startswith(prefix)]
    kept = []
    for action in list(bpy.data.actions):
        if action.name.startswith(prefix):
            action.use_fake_user = True
            kept.append(action.name)
    return kept


SHAPE_KEYS = [
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
