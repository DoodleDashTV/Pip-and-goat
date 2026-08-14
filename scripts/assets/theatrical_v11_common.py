"""Shared helpers for proposed theatrical v1.1 assets. Never writes production-library/."""

from __future__ import annotations

import math
from pathlib import Path

from theatrical_v1_common import (  # noqa: F401
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
)

REPO_ROOT = Path(__file__).resolve().parents[2]
PROPOSED_V11 = REPO_ROOT / "theatrical-foundation/proposed/v1.1"
TEXTURES_V11 = PROPOSED_V11 / "textures"

# Appeal regression guards. Measured against the approved polish / canonical DNA.
# These are guards, not a substitute for visual review.
PIP_APPEAL = {
    "headRadius": 0.155,
    "bodyRadius": 0.135,
    "headToBody": 1.15,
    "eyeWhiteRadius": 0.060,
    "eyeToHead": 0.387,
    "eyeSpacing": 0.116,
    "beakLength": 0.050,
    "crestHeight": 0.16,
    "limbLength": 0.11,
}
GOAT_APPEAL = {
    "headRadius": 0.200,
    "bodyRadius": 0.210,
    "headToBody": 0.95,
    "eyeWhiteRadius": 0.070,
    "eyeToHead": 0.350,
    "eyeSpacing": 0.150,
    "muzzleRadius": 0.078,
    "hornLength": 0.110,
    "limbLength": 0.30,
}
# Proposed must stay within this relative band of the reference, and must not
# shrink eyes below the hard floor (Goat eye appeal is an automatic failure).
APPEAL_BAND = 0.22
PIP_EYE_FLOOR = 0.050
GOAT_EYE_FLOOR = 0.060
GOAT_EYE_TO_HEAD_FLOOR = 0.30


def fuzz_mat(name, color, *, roughness=0.48, subsurface=0.18, sheen=0.42, coat=0.0):
    """Clean stylized surface: sheen + SSS. No cards, no noisy bump."""
    mat = principled_mat(
        name,
        color,
        roughness=roughness,
        subsurface=subsurface,
        sheen=sheen,
        coat=coat,
        specular=0.22,
    )
    return mat


def write_maps(stem: str, base_rgb, size=2048, fiber=0.05, contrast=0.08):
    """Local 2K maps written under v1.1/textures. Restrained fiber, locked hue."""
    import numpy as np

    from png_io import write_stored_srgb

    TEXTURES_V11.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(abs(hash(f"v11-{stem}")) % (2**32))
    y = np.linspace(0, 1, size, dtype=np.float32)
    x = np.linspace(0, 1, size, dtype=np.float32)
    xx, yy = np.meshgrid(x, y)
    n1 = rng.random((size, size)).astype(np.float32)
    n2 = rng.random((size // 8, size // 8)).astype(np.float32)
    coarse = np.kron(n2, np.ones((8, 8), dtype=np.float32))[:size, :size]
    grain = 0.5 + 0.5 * np.sin((xx * 22 + yy * 4) * math.pi * 2 + coarse * 1.4)
    variation = (coarse * contrast + grain * fiber + n1 * 0.02) - (contrast + fiber) * 0.5

    albedo = np.zeros((size, size, 3), dtype=np.uint8)
    for i, ch in enumerate(base_rgb):
        val = np.clip(ch * 255.0 * (1.0 + variation), 0, 255)
        albedo[:, :, i] = val.astype(np.uint8)
    rough = np.clip(128 + variation * 70, 80, 200).astype(np.uint8)
    roughness = np.stack([rough, rough, rough], axis=2)
    nx = np.clip(128 + (grain - 0.5) * 18, 0, 255).astype(np.uint8)
    ny = np.clip(128 + (coarse - 0.5) * 14, 0, 255).astype(np.uint8)
    nz = np.full((size, size), 245, dtype=np.uint8)
    normal = np.stack([nx, ny, nz], axis=2)
    paths = {
        "basecolor": TEXTURES_V11 / f"{stem}_basecolor_2k.png",
        "roughness": TEXTURES_V11 / f"{stem}_roughness_2k.png",
        "normal": TEXTURES_V11 / f"{stem}_normal_2k.png",
    }
    write_stored_srgb(paths["basecolor"], albedo)
    write_stored_srgb(paths["roughness"], roughness)
    write_stored_srgb(paths["normal"], normal)
    return paths


def write_map_graphic(size=2048):
    """Readable adventure-map graphic: paper, folds, route, compass, landmarks."""
    import numpy as np

    from png_io import write_stored_srgb

    TEXTURES_V11.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(20260814)
    y = np.linspace(0, 1, size, dtype=np.float32)
    x = np.linspace(0, 1, size, dtype=np.float32)
    xx, yy = np.meshgrid(x, y)
    paper = np.zeros((size, size, 3), dtype=np.float32)
    paper[:, :, 0] = 0.90
    paper[:, :, 1] = 0.84
    paper[:, :, 2] = 0.68
    fiber = 0.04 * np.sin((xx * 90 + yy * 8) * math.pi * 2)
    stain = 0.03 * rng.random((size, size)).astype(np.float32)
    paper += (fiber + stain - 0.02)[..., None]
    # Fold memory
    fold_v = np.exp(-((xx - 0.5) ** 2) / 0.00035)
    fold_h = np.exp(-((yy - 0.5) ** 2) / 0.00035)
    paper -= 0.10 * (fold_v + fold_h)[..., None]
    # Edge wear
    edge = np.minimum(np.minimum(xx, 1 - xx), np.minimum(yy, 1 - yy))
    paper *= (0.82 + 0.18 * np.clip(edge * 18, 0, 1))[..., None]

    def disk(cx, cy, r, color, softness=0.012):
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        w = np.clip(1.0 - (d - r) / softness, 0, 1)
        paper[:] = paper * (1 - w)[..., None] + np.array(color, dtype=np.float32) * w[..., None]

    def stroke(points, width, color):
        acc = np.zeros((size, size), dtype=np.float32)
        for i in range(len(points) - 1):
            x0, y0 = points[i]
            x1, y1 = points[i + 1]
            vx, vy = x1 - x0, y1 - y0
            length = math.hypot(vx, vy) or 1e-6
            t = ((xx - x0) * vx + (yy - y0) * vy) / (length * length)
            t = np.clip(t, 0, 1)
            px, py = x0 + t * vx, y0 + t * vy
            d = np.sqrt((xx - px) ** 2 + (yy - py) ** 2)
            acc = np.maximum(acc, np.clip(1.0 - (d - width) / 0.008, 0, 1))
        paper[:] = paper * (1 - acc)[..., None] + np.array(color, dtype=np.float32) * acc[..., None]

    # Land / water
    disk(0.32, 0.58, 0.16, (0.46, 0.66, 0.34), 0.03)
    disk(0.28, 0.62, 0.07, (0.38, 0.58, 0.26), 0.02)
    disk(0.72, 0.38, 0.13, (0.42, 0.64, 0.78), 0.03)
    # Route
    stroke(
        [(0.18, 0.78), (0.30, 0.62), (0.42, 0.52), (0.55, 0.48), (0.68, 0.36), (0.80, 0.22)],
        0.012,
        (0.72, 0.16, 0.14),
    )
    # Start / X
    disk(0.18, 0.78, 0.018, (0.18, 0.10, 0.08), 0.006)
    stroke([(0.78, 0.19), (0.84, 0.25)], 0.008, (0.72, 0.16, 0.14))
    stroke([(0.84, 0.19), (0.78, 0.25)], 0.008, (0.72, 0.16, 0.14))
    # Compass
    disk(0.18, 0.18, 0.07, (0.93, 0.86, 0.62), 0.01)
    disk(0.18, 0.18, 0.055, (0.90, 0.82, 0.58), 0.008)
    stroke([(0.18, 0.12), (0.18, 0.24)], 0.006, (0.18, 0.10, 0.08))
    stroke([(0.12, 0.18), (0.24, 0.18)], 0.006, (0.18, 0.10, 0.08))
    disk(0.18, 0.12, 0.012, (0.72, 0.16, 0.14), 0.004)

    rgb = np.clip(paper * 255.0, 0, 255).astype(np.uint8)
    rough = np.clip(150 + (fiber + stain) * 80, 90, 210).astype(np.uint8)
    roughness = np.stack([rough, rough, rough], axis=2)
    nx = np.clip(128 + fiber * 40, 0, 255).astype(np.uint8)
    ny = np.clip(128 + (fold_v + fold_h) * 30, 0, 255).astype(np.uint8)
    nz = np.full((size, size), 236, dtype=np.uint8)
    normal = np.stack([nx, ny, nz], axis=2)
    paths = {
        "basecolor": TEXTURES_V11 / "map_paper_basecolor_2k.png",
        "roughness": TEXTURES_V11 / "map_paper_roughness_2k.png",
        "normal": TEXTURES_V11 / "map_paper_normal_2k.png",
    }
    write_stored_srgb(paths["basecolor"], rgb)
    write_stored_srgb(paths["roughness"], roughness)
    write_stored_srgb(paths["normal"], normal)
    return paths


def within_band(value: float, reference: float, band: float = APPEAL_BAND) -> bool:
    if reference <= 0:
        return False
    return abs(value - reference) / reference <= band


def make_sphere(name, radius, loc, segs=24, rings=16, material=None, scale=None):
    import bpy

    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=segs, ring_count=rings)
    obj = bpy.context.object
    obj.name = name
    if scale:
        obj.scale = scale
    if material:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    smooth(obj)
    return obj


def make_cylinder(name, radius, depth, loc, verts=16, material=None, rot=None, scale=None):
    import bpy

    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=loc, vertices=verts)
    obj = bpy.context.object
    obj.name = name
    if rot:
        obj.rotation_euler = rot
    if scale:
        obj.scale = scale
    if material:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    smooth(obj)
    return obj


def make_cone(name, radius, depth, loc, verts=12, material=None, rot=None):
    import bpy

    bpy.ops.mesh.primitive_cone_add(radius1=radius, depth=depth, location=loc, vertices=verts)
    obj = bpy.context.object
    obj.name = name
    if rot:
        obj.rotation_euler = rot
    if material:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    smooth(obj)
    return obj


def make_star(name, loc, radius, material):
    import bpy

    bpy.ops.mesh.primitive_circle_add(vertices=10, radius=radius, fill_type="NGON", location=loc)
    obj = bpy.context.object
    obj.name = name
    for i, vert in enumerate(obj.data.vertices):
        if i % 2 == 1:
            vert.co *= 0.42
    obj.rotation_euler = (math.radians(90), 0, 0)
    if material:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    smooth(obj)
    return obj


def finalize_mesh(obj):
    import bpy

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    smooth(obj)


def pose_action(arm, name, rotations, locations=None):
    """Single-frame readable pose. Not a T-pose."""

    def fn(a, _frame, _t):
        for bone, euler in rotations.items():
            if bone in a.pose.bones:
                a.pose.bones[bone].rotation_euler = euler
        if locations:
            for bone, loc in locations.items():
                if bone in a.pose.bones:
                    a.pose.bones[bone].location = loc

    return add_action(arm, name, 8, fn)
