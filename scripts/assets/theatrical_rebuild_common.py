"""Helpers for the proposed Pip/Goat theatrical production rebuild.

Never writes production-library/. Never mutates existing v2 primaries.
Binding five-view JPEGs are the visual authority.
"""

from __future__ import annotations

import math
from pathlib import Path

from theatrical_v1_common import (  # noqa: F401
    apply_all,
    assert_not_production_library,
    attach_image_maps,
    ensure_uv,
    link,
    principled_mat,
    reset_scene,
    smooth,
)
from theatrical_v11_common import finalize_mesh, fuzz_mat, make_cone, make_cylinder, make_sphere

REPO_ROOT = Path(__file__).resolve().parents[2]
PROPOSED_REBUILD = REPO_ROOT / "theatrical-foundation/proposed/v2/production-rebuild"
TEXTURES = PROPOSED_REBUILD / "textures"
ARTIFACTS = REPO_ROOT / "artifacts/theatrical-v2/production-rebuild"
REFS = REPO_ROOT / "artifacts/theatrical-v2/source-package-validation/refs"

# Binding-family colors. Not v1 kitbash DNA. Not neon lemon. Not mustard.
PIP_CHARTREUSE = (0.82, 0.76, 0.18)
PIP_CREAM = (0.90, 0.86, 0.60)
PIP_OLIVE = (0.58, 0.54, 0.16)
PIP_CREST = (0.84, 0.34, 0.24)
PIP_BEAK = (0.86, 0.42, 0.16)
PIP_BEAK_IN = (0.42, 0.14, 0.10)
PIP_FEET = (0.70, 0.36, 0.14)
PIP_CLAW = (0.22, 0.10, 0.06)
PIP_TEAL = (0.10, 0.46, 0.48)
PIP_TEAL_DEEP = (0.07, 0.34, 0.36)
PIP_COPPER = (0.68, 0.40, 0.18)
PIP_IRIS = (0.16, 0.50, 0.34)
PIP_BROW = (0.22, 0.12, 0.06)
PIP_LASH = (0.08, 0.05, 0.04)
PIP_TAIL = (0.82, 0.48, 0.18)
PIP_TONGUE = (0.82, 0.30, 0.32)

GOAT_OATMEAL = (0.86, 0.78, 0.66)
GOAT_OAT_DEEP = (0.70, 0.60, 0.48)
GOAT_CINNAMON = (0.54, 0.26, 0.12)
GOAT_HORN = (0.30, 0.16, 0.10)
GOAT_NOSE = (0.52, 0.26, 0.30)
GOAT_EAR_IN = (0.88, 0.62, 0.56)
GOAT_SCARF = (0.76, 0.32, 0.12)
GOAT_HOOF = (0.16, 0.12, 0.10)
GOAT_IRIS = (0.52, 0.36, 0.14)
GOAT_TEAL = (0.10, 0.46, 0.48)
GOAT_COPPER = (0.68, 0.40, 0.18)
GOAT_BROW = (0.20, 0.11, 0.06)
GOAT_TONGUE = (0.82, 0.32, 0.34)
GOAT_MOUTH = (0.30, 0.08, 0.10)

PIP_TARGET_HEIGHT = 2.05
GOAT_SCALE = 1.50


def write_maps(stem: str, base_rgb, size=1024, fiber=0.04, contrast=0.06):
    """Locked-hue lookdev maps under production-rebuild/textures."""
    import numpy as np

    from png_io import write_stored_srgb

    TEXTURES.mkdir(parents=True, exist_ok=True)
    seed = sum(ord(ch) for ch in f"rebuild-{stem}") % (2**32)
    rng = np.random.default_rng(seed)
    y = np.linspace(0, 1, size, dtype=np.float32)
    x = np.linspace(0, 1, size, dtype=np.float32)
    xx, yy = np.meshgrid(x, y)
    n1 = rng.random((size, size)).astype(np.float32)
    n2 = rng.random((size // 8, size // 8)).astype(np.float32)
    coarse = np.kron(n2, np.ones((8, 8), dtype=np.float32))[:size, :size]
    grain = 0.5 + 0.5 * np.sin((xx * 20 + yy * 5) * math.pi * 2 + coarse * 1.2)
    variation = (coarse * contrast + grain * fiber + n1 * 0.015) - (contrast + fiber) * 0.5

    albedo = np.zeros((size, size, 3), dtype=np.uint8)
    for i, ch in enumerate(base_rgb):
        albedo[:, :, i] = np.clip(ch * 255.0 * (1.0 + variation), 0, 255).astype(np.uint8)
    rough = np.clip(132 + variation * 64, 88, 196).astype(np.uint8)
    roughness = np.stack([rough, rough, rough], axis=2)
    nx = np.clip(128 + (grain - 0.5) * 16, 0, 255).astype(np.uint8)
    ny = np.clip(128 + (coarse - 0.5) * 12, 0, 255).astype(np.uint8)
    nz = np.full((size, size), 246, dtype=np.uint8)
    normal = np.stack([nx, ny, nz], axis=2)
    paths = {
        "basecolor": TEXTURES / f"{stem}_basecolor_1k.png",
        "roughness": TEXTURES / f"{stem}_roughness_1k.png",
        "normal": TEXTURES / f"{stem}_normal_1k.png",
    }
    write_stored_srgb(paths["basecolor"], albedo)
    write_stored_srgb(paths["roughness"], roughness)
    write_stored_srgb(paths["normal"], normal)
    return paths


def cloth_mat(name, color, *, roughness=0.62, sheen=0.52):
    return principled_mat(name, color, roughness=roughness, sheen=sheen, specular=0.18, subsurface=0.03)


def leather_mat(name, color, *, roughness=0.50):
    return principled_mat(name, color, roughness=roughness, sheen=0.16, specular=0.26, coat=0.04, coat_rough=0.40)


def metal_mat(name, color, *, roughness=0.34, metallic=0.72):
    return principled_mat(name, color, roughness=roughness, metallic=metallic, specular=0.45, coat=0.08, coat_rough=0.28)


def eye_white_mat(name):
    return principled_mat(name, (0.97, 0.97, 0.96), roughness=0.10, specular=0.58, coat=0.20, coat_rough=0.08)


def eye_iris_mat(name, color):
    return principled_mat(name, color, roughness=0.22, specular=0.40, coat=0.14, coat_rough=0.12)


def eye_pupil_mat(name):
    return principled_mat(name, (0.04, 0.03, 0.03), roughness=0.18, specular=0.30)


def eye_catch_mat(name):
    return principled_mat(name, (1.0, 1.0, 1.0), roughness=0.08, specular=0.55, coat=0.22, coat_rough=0.06, emission=0.08)


def make_torus(name, major, minor, loc, material=None, rot=None, major_seg=36, minor_seg=12):
    import bpy

    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=major_seg,
        minor_segments=minor_seg,
        location=loc,
    )
    obj = bpy.context.object
    obj.name = name
    if rot:
        obj.rotation_euler = rot
    if material:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    smooth(obj)
    return obj


def make_cube(name, loc, scale, material=None, rot=None):
    import bpy

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    if rot:
        obj.rotation_euler = rot
    if material:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    smooth(obj)
    return obj


def make_bar(name, a, b, radius, material, verts=12):
    import bpy
    from mathutils import Vector

    start = Vector(a)
    end = Vector(b)
    mid = (start + end) * 0.5
    direction = end - start
    length = max(direction.length, 1e-4)
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=length, location=mid, vertices=verts)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = Vector((0.0, 0.0, 1.0)).rotation_difference(direction).to_euler()
    if material:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    smooth(obj)
    return obj


def make_spiral(name, loc, radius, material, turns=2.3, tube=None, rot=None):
    import bpy

    curve_data = bpy.data.curves.new(name + "_crv", "CURVE")
    curve_data.dimensions = "3D"
    curve_data.bevel_depth = tube if tube is not None else radius * 0.085
    curve_data.bevel_resolution = 3
    spline = curve_data.splines.new("POLY")
    count = 42
    spline.points.add(count - 1)
    for i in range(count):
        t = i / (count - 1)
        ang = t * turns * math.pi * 2.0
        r = radius * (0.10 + 0.90 * t)
        spline.points[i].co = (0.0, r * math.cos(ang), r * math.sin(ang), 1.0)
    obj = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    if rot:
        obj.rotation_euler = rot
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    if material:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    smooth(obj)
    return obj


def make_root(name):
    import bpy

    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = 0.12
    bpy.context.collection.objects.link(empty)
    return empty


def parent_keep(obj, root):
    mw = obj.matrix_world.copy()
    obj.parent = root
    obj.matrix_parent_inverse = root.matrix_world.inverted()
    obj.matrix_world = mw


def tagged(obj, **props):
    for key, value in props.items():
        obj[key] = value
    return obj


def world_bounds_objects(objects):
    from mathutils import Vector

    coords = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        coords.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not coords:
        raise RuntimeError("no mesh bounds")
    xs, ys, zs = zip(*[(c.x, c.y, c.z) for c in coords])
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def mesh_objects(prefix: str):
    import bpy

    return [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.startswith(prefix)]


def snap_root_to_ground(root, prefix: str):
    import bpy

    mn, _ = world_bounds_objects(mesh_objects(prefix))
    root.location.z -= mn.z
    bpy.context.view_layer.update()


def mesh_centroid(obj):
    from mathutils import Vector

    acc = Vector()
    verts = obj.data.vertices
    if not verts:
        return obj.matrix_world.translation.copy()
    for vert in verts:
        acc += obj.matrix_world @ vert.co
    return acc / len(verts)


def shade_smooth_object(obj):
    import bpy

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()


def scale_root_to_height(root, prefix: str, target: float):
    import bpy

    mn, mx = world_bounds_objects(mesh_objects(prefix))
    height = max(mx.z - mn.z, 1e-4)
    root.scale *= target / height
    bpy.context.view_layer.update()
    snap_root_to_ground(root, prefix)


def apply_and_parent(prefix: str, root, uv_names=()):
    import bpy

    for obj in list(bpy.data.objects):
        if obj.type != "MESH" or not obj.name.startswith(prefix):
            continue
        apply_all(obj)
        finalize_mesh(obj)
        shade_smooth_object(obj)
        if obj.name in uv_names:
            ensure_uv(obj)
        parent_keep(obj, root)
        tagged(
            obj,
            ddp_approved=False,
            ddp_quality="PROPOSED_PRODUCTION_REBUILD",
            ddp_theatrical_bound=False,
        )
