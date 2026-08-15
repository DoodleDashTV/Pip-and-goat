#!/usr/bin/env python3
"""Correct the approved original Pip to one continuous cross-body strap.

Non-destructive: does not move fused body verts. The first flatten pass
shredded the mesh and is not reused.

Hides the false backpack straps with a vertex-color shader mix, then adds
a separate surface-following ribbon that starts at the character-right
shoulder, crosses the front, wraps the same shoulder, crosses the back,
and meets the satchel on the character-left hip.

Does not overwrite current Prism Pip. Does not write production-library/.
Does not save a >=100MB blend. Does not retopo, rig, merge, or declare canon.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/fix_pip_original_strap.py
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "assets"))

from build_final_character_production import (  # noqa: E402
    CHAR_LEFT,
    FACING,
    PIP_HEIGHT,
    add_camera,
    bounds,
    meshes,
    render_path,
)
from inspect_pip_long_wing_candidate import sample_colors, teal, yellow  # noqa: E402
from polish_final_character_finish import feature_lights  # noqa: E402
from refine_v2_overnight import adjacency, raster_tri  # noqa: E402
from theatrical_rebuild_common import assert_not_production_library  # noqa: E402
from theatrical_v1_common import principled_mat  # noqa: E402

GLB = Path("/tmp/pip_long_wing_candidate_original.glb")
EXPECTED = "9158dea0e23e5ebb086a574badb0b5a62982d0b90e1d8b118f54cfac0549c4f2"
STRAP_BLEND = (
    REPO
    / "theatrical-foundation/proposed/final-character-production/source-candidates/pip-long-wing"
    / "pip_crossbody_strap_only.blend"
)
PREVIEWS = REPO / "artifacts/theatrical-v2/final-character-production/long-wing-original-strap"
REPORTS = REPO / "theatrical-foundation/proposed/final-character-production/reports"
CURRENT_PRISM = (
    REPO / "theatrical-foundation/proposed/final-character-production/high-resolution/pip_highres_candidate.blend"
)

TEAL = (0.07, 0.28, 0.26)
TEAL_STITCH = (0.04, 0.18, 0.16)
COPPER = (0.62, 0.38, 0.16)
CHARTREUSE = (0.80, 0.73, 0.22)
CREAM = (0.90, 0.84, 0.48)
OFFSET = 0.012
STRAP_WIDTH = 0.048
STRAP_THICK = 0.007
SHOULDER_Z_MAX = 1.165


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def shoot(name, loc, focus, ortho, dest, samples=24):
    cam = add_camera(name, loc, focus, ortho)
    bpy.context.scene.camera = cam
    render_path(dest, samples=samples)
    return str(dest.relative_to(REPO))


def in_scarf(world: Vector) -> bool:
    """Neckerchief only — not the backpack risers that emerge under it."""
    if world.z > 1.12 and (world.x * world.x + world.y * world.y) < 0.10:
        return True
    if world.z > 1.10 and abs(world.y) < 0.10 and 0.08 < world.x < 0.28:
        return True
    if world.z > 1.10 and abs(world.y) < 0.12 and -0.22 < world.x < 0.06:
        return True
    return False


def in_bag(world: Vector) -> bool:
    """Satchel body and flap on the character-left hip. Do not hide."""
    return world.z < 0.64 and world.x > 0.10 and -0.06 < world.y < 0.28


def in_left_riser(world: Vector) -> bool:
    return 0.10 < world.x < 0.50 and 0.03 < world.y < 0.20 and 0.58 < world.z < 1.04


def in_right_riser(world: Vector) -> bool:
    return 0.10 < world.x < 0.50 and -0.20 < world.y < -0.02 and 0.58 < world.z < 1.04


def in_false_strap(world: Vector) -> bool:
    """Front backpack risers only. The original rear diagonal is already correct."""
    if in_scarf(world) or in_bag(world):
        return False
    return in_left_riser(world) or in_right_riser(world)


def strap_like(col) -> bool:
    """Teal leather plus the gold-dot mix that fails a strict teal() test."""
    r, g, b = col
    if yellow(col):
        return False
    if teal(col):
        return True
    return g > 0.18 and b > 0.10 and r < 0.62 and (b > r - 0.02 or g > r + 0.02)


def color_image():
    return next(
        (
            img
            for img in bpy.data.images
            if img.size[0] > 64 and "color" in img.name.lower() and "normal" not in img.name.lower()
        ),
        None,
    )


def paint_false_straps(obj, colors) -> dict:
    """Paint old strap tris yellow on the Color map. Does not move verts."""
    import numpy as np

    mw = obj.matrix_world
    verts = obj.data.vertices
    adj = adjacency(obj)
    seeds = []
    for vid, col in colors.items():
        world = mw @ verts[vid].co
        if in_false_strap(world) and strap_like(col):
            seeds.append(vid)
    paint_ids = set(seeds)
    for vid in seeds:
        for nb in adj[vid]:
            world = mw @ verts[nb].co
            if in_scarf(world) or in_bag(world):
                continue
            if in_false_strap(world):
                paint_ids.add(nb)
    img = color_image()
    painted = 0
    if img is None or not obj.data.uv_layers:
        return {"seeds": len(seeds), "paint_ids": len(paint_ids), "painted": 0}
    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape((h, w, 4))
    uv = obj.data.uv_layers.active.data
    cream = np.array([*CREAM, 1.0], dtype=np.float32)
    body = np.array([*CHARTREUSE, 1.0], dtype=np.float32)
    for poly in obj.data.polygons:
        loops = list(poly.loop_indices)
        vids = [obj.data.loops[li].vertex_index for li in loops]
        marked = [vid in paint_ids for vid in vids]
        if sum(marked) < 2:
            continue
        world = mw @ verts[vids[0]].co
        color = cream if world.x > 0.10 else body
        pts = [(float(uv[li].uv.x) * (w - 1), float(uv[li].uv.y) * (h - 1)) for li in loops]
        alphas = [0.92 if flag else 0.15 for flag in marked]
        for i in range(1, len(pts) - 1):
            painted += raster_tri(px, [pts[0], pts[i], pts[i + 1]], [alphas[0], alphas[i], alphas[i + 1]], color, 0.90)
    img.pixels.foreach_set(px.reshape(-1))
    img.update()
    return {"seeds": len(seeds), "paint_ids": len(paint_ids), "painted": painted}


def ray_hit(obj, src: Vector, dst: Vector, offset: float = OFFSET):
    mw = obj.matrix_world
    imw = mw.inverted()
    local_src = imw @ src
    local_dst = imw @ dst
    direction = local_dst - local_src
    dist = direction.length
    if dist < 1e-6:
        return None
    ok, loc, nrm, _idx = obj.ray_cast(local_src, direction.normalized(), distance=dist + 0.08)
    if not ok:
        return None
    world = mw @ loc
    normal = (mw.to_3x3() @ nrm).normalized()
    if normal.dot(src - world) < 0:
        normal = -normal
    placed = world + normal * offset
    if placed.z > SHOULDER_Z_MAX:
        placed = Vector((placed.x, placed.y, SHOULDER_Z_MAX))
    return placed, normal


def ray_hit_multi(obj, src: Vector, dst: Vector):
    jitters = (
        Vector((0, 0, 0)),
        Vector((0.04, 0.00, 0.02)),
        Vector((-0.04, 0.00, -0.02)),
        Vector((0.00, 0.03, 0.02)),
        Vector((0.00, -0.03, 0.02)),
    )
    for jitter in jitters:
        hit = ray_hit(obj, src + jitter, dst)
        if hit is not None:
            return hit
    return None


def stations() -> list[tuple[Vector, Vector]]:
    """Aim rays that reconstruct one continuous cross-body path.

    Bag on character-left hip (+Y). Strap over character-right shoulder (−Y).
    Front diagonal, then the same shoulder, then back diagonal, then bag.
    Shoulder rays stay beside the neck, never from above the head.
    Left-hip wrap rays stay inside the wing, aimed at the bag, not +Y.
    """
    return [
        (Vector((0.70, 0.18, 0.52)), Vector((0.20, 0.16, 0.50))),
        (Vector((0.70, 0.12, 0.62)), Vector((0.12, 0.10, 0.60))),
        (Vector((0.68, 0.06, 0.72)), Vector((0.08, 0.04, 0.70))),
        (Vector((0.66, 0.00, 0.82)), Vector((0.06, 0.00, 0.80))),
        (Vector((0.64, -0.06, 0.92)), Vector((0.04, -0.06, 0.90))),
        (Vector((0.58, -0.12, 1.02)), Vector((0.04, -0.10, 1.00))),
        (Vector((0.48, -0.20, 1.06)), Vector((0.02, -0.16, 1.04))),
        (Vector((0.32, -0.30, 1.10)), Vector((0.02, -0.18, 1.06))),
        (Vector((0.14, -0.40, 1.12)), Vector((0.00, -0.18, 1.06))),
        (Vector((-0.02, -0.42, 1.12)), Vector((0.00, -0.18, 1.06))),
        (Vector((-0.16, -0.38, 1.10)), Vector((0.00, -0.16, 1.04))),
    ]


def smooth_hits(hits):
    pts = [h[0].copy() for h in hits]
    nrms = [h[1].copy() for h in hits]
    for _ in range(2):
        nxt = [pts[0]]
        for i in range(1, len(pts) - 1):
            nxt.append(pts[i - 1] * 0.22 + pts[i] * 0.56 + pts[i + 1] * 0.22)
        nxt.append(pts[-1])
        pts = nxt
    return list(zip(pts, nrms))


def trace_path(obj) -> list[tuple[Vector, Vector]]:
    hits = []
    missed = 0
    for src, dst in stations():
        hit = ray_hit_multi(obj, src, dst)
        if hit is None:
            missed += 1
            print(f"miss {src} -> {dst}")
            continue
        hits.append(hit)
    if len(hits) < 8:
        raise RuntimeError(f"strap path too short: {len(hits)} hits, missed={missed}")
    hits = smooth_hits(hits)
    print(f"strap ray hits={len(hits)} missed={missed}")
    return hits


def _frame(hits, i, prev_side=None):
    loc, nrm = hits[i]
    if i == 0:
        tangent = (hits[1][0] - loc).normalized()
    elif i == len(hits) - 1:
        tangent = (loc - hits[i - 1][0]).normalized()
    else:
        tangent = (hits[i + 1][0] - hits[i - 1][0]).normalized()
    nrm = nrm.normalized()
    side = tangent.cross(nrm)
    if side.length < 0.35:
        side = tangent.cross(Vector((0.0, 0.0, 1.0)))
    side = side.normalized()
    if prev_side is not None and side.dot(prev_side) < 0:
        side = -side
    nrm = side.cross(tangent).normalized()
    return loc, tangent, nrm, side


def make_ribbon(hits) -> bpy.types.Object:
    verts = []
    faces = []
    uvs = []
    n = len(hits)
    half_w = STRAP_WIDTH * 0.5
    prev_side = None
    for i in range(n):
        loc, _tangent, nrm, side = _frame(hits, i, prev_side)
        prev_side = side
        v = i / max(n - 1, 1)
        outer = loc + side * half_w + nrm * STRAP_THICK
        inner = loc - side * half_w + nrm * STRAP_THICK
        inner_b = loc - side * half_w + nrm * 0.0015
        outer_b = loc + side * half_w + nrm * 0.0015
        verts.extend([outer, inner, inner_b, outer_b])
        uvs.extend([(0.0, v), (1.0, v), (1.0, v), (0.0, v)])
    for i in range(n - 1):
        a = i * 4
        b = (i + 1) * 4
        faces.extend(
            [
                (a, a + 1, b + 1, b),
                (a + 1, a + 2, b + 2, b + 1),
                (a + 2, a + 3, b + 3, b + 2),
                (a + 3, a, b, b + 3),
            ]
        )
    faces.append((0, 3, 2, 1))
    last = (n - 1) * 4
    faces.append((last, last + 1, last + 2, last + 3))
    mesh = bpy.data.meshes.new("Pip_CrossbodyStrapMesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    # from_pydata creates 4 loops per quad in the given order.
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vid = mesh.loops[li].vertex_index
            uv.data[li].uv = uvs[vid]
    obj = bpy.data.objects.new("Pip_CrossbodyStrap", mesh)
    bpy.context.collection.objects.link(obj)
    mat = strap_material()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def sit_on_body(strap, body):
    mod = strap.modifiers.new("sit", "SHRINKWRAP")
    mod.target = body
    mod.wrap_method = "NEAREST_SURFACEPOINT"
    mod.wrap_mode = "ABOVE_SURFACE"
    mod.offset = OFFSET
    bpy.context.view_layer.objects.active = strap
    strap.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def strap_material():
    mat = principled_mat("Pip_CrossbodyStrapMat", TEAL, roughness=0.50, specular=0.20, sheen=0.16)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tex.outputs["UV"], sep.inputs["Vector"])
    # Two stitch rows near the strap edges.
    edge = nt.nodes.new("ShaderNodeMath")
    edge.operation = "PINGPONG"
    edge.inputs[1].default_value = 0.5
    nt.links.new(sep.outputs["X"], edge.inputs[0])
    stitch = nt.nodes.new("ShaderNodeMath")
    stitch.operation = "COMPARE"
    stitch.inputs[1].default_value = 0.11
    stitch.inputs[2].default_value = 0.025
    nt.links.new(edge.outputs["Value"], stitch.inputs[0])
    dash = nt.nodes.new("ShaderNodeMath")
    dash.operation = "PINGPONG"
    dash.inputs[1].default_value = 0.018
    scale_v = nt.nodes.new("ShaderNodeMath")
    scale_v.operation = "MULTIPLY"
    scale_v.inputs[1].default_value = 28.0
    nt.links.new(sep.outputs["Y"], scale_v.inputs[0])
    nt.links.new(scale_v.outputs["Value"], dash.inputs[0])
    dash_cmp = nt.nodes.new("ShaderNodeMath")
    dash_cmp.operation = "COMPARE"
    dash_cmp.inputs[1].default_value = 0.009
    dash_cmp.inputs[2].default_value = 0.006
    nt.links.new(dash.outputs["Value"], dash_cmp.inputs[0])
    both = nt.nodes.new("ShaderNodeMath")
    both.operation = "MULTIPLY"
    nt.links.new(stitch.outputs["Value"], both.inputs[0])
    nt.links.new(dash_cmp.outputs["Value"], both.inputs[1])
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MIX"
    mix.inputs["Color1"].default_value = (*TEAL, 1.0)
    mix.inputs["Color2"].default_value = (*TEAL_STITCH, 1.0)
    nt.links.new(both.outputs["Value"], mix.inputs["Fac"])
    nt.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def add_hardware(hits) -> list[str]:
    copper = principled_mat("Pip_StrapHardware", COPPER, roughness=0.28, metallic=0.58, specular=0.46)
    names = []
    n = len(hits)
    right_front = min(range(n), key=lambda i: hits[i][0].y - hits[i][0].x * 0.2 if hits[i][0].z > 1.00 and hits[i][0].x > 0 else 99)
    right_back = min(range(n), key=lambda i: hits[i][0].y + hits[i][0].x * 0.2 if hits[i][0].z > 1.00 and hits[i][0].x < 0 else 99)
    back_mid = min(range(n), key=lambda i: hits[i][0].x if 0.70 < hits[i][0].z < 0.95 else 99)
    picks = [
        (0, "bag_front"),
        (right_front, "right_shoulder_front"),
        (right_back, "right_shoulder_back"),
    ]
    for idx, label in picks:
        loc, tangent, nrm, side = _frame(hits, idx)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc + nrm * (STRAP_THICK * 0.7))
        buckle = bpy.context.active_object
        buckle.name = f"Pip_StrapBuckle_{label}"
        buckle.scale = (STRAP_WIDTH * 0.42, 0.016, 0.006)
        rot = tangent.to_track_quat("Y", "Z").to_matrix().to_4x4()
        buckle.rotation_euler = rot.to_euler()
        buckle.data.materials.append(copper)
        names.append(buckle.name)
    return names


def save_strap_only(strap, hardware_names) -> dict:
    assert_not_production_library(STRAP_BLEND)
    keep = {strap.name, *hardware_names}
    for obj in list(bpy.data.objects):
        if obj.name not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    STRAP_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(STRAP_BLEND), compress=True)
    size = STRAP_BLEND.stat().st_size
    if size >= 100 * 1024 * 1024:
        STRAP_BLEND.unlink()
        raise RuntimeError(f"refusing to keep strap blend at {size} bytes")
    return {"blend": str(STRAP_BLEND.relative_to(REPO)), "bytes": size}


def render_proofs() -> list[str]:
    feature_lights()
    mn, mx = bounds()
    center = (mn + mx) * 0.5
    height = max(mx.z - mn.z, 0.001)
    radius = max(mx.x - mn.x, mx.y - mn.y, height) * 1.45
    dest = PREVIEWS
    dest.mkdir(parents=True, exist_ok=True)
    wanted = os.environ.get("PIP_STRAP_VIEWS", "all")
    views = {
        "01_front.png": ("front", center + FACING * radius, center + Vector((0, 0, 0.02)), height * 1.28),
        "02_rear.png": ("rear", center - FACING * radius, center + Vector((0, 0, 0.02)), height * 1.28),
        "03_left_side.png": ("left", center + CHAR_LEFT * radius, center + Vector((0, 0, 0.02)), height * 1.28),
        "04_right_side.png": ("right", center - CHAR_LEFT * radius, center + Vector((0, 0, 0.02)), height * 1.28),
        "05_front_three_quarter.png": (
            "front_3q",
            center + (FACING * 0.72 + CHAR_LEFT * 0.72) * radius,
            center + Vector((0, 0, 0.02)),
            height * 1.32,
        ),
        "06_rear_three_quarter.png": (
            "rear_3q",
            center + (-FACING * 0.72 + CHAR_LEFT * 0.72) * radius,
            center + Vector((0, 0, 0.02)),
            height * 1.32,
        ),
        "07_right_shoulder_closeup.png": (
            "r_shoulder",
            Vector((0.42, -0.24, 1.16)),
            Vector((0.06, -0.16, 1.14)),
            height * 0.38,
        ),
        "08_left_shoulder_closeup.png": (
            "l_shoulder",
            Vector((0.42, 0.22, 1.16)),
            Vector((0.08, 0.10, 1.10)),
            height * 0.38,
        ),
        "09_satchel_front_attach.png": (
            "bag_front",
            Vector((0.55, 0.16, 0.52)),
            Vector((0.22, 0.16, 0.50)),
            height * 0.36,
        ),
        "10_satchel_rear_attach.png": (
            "bag_rear",
            Vector((-0.45, 0.16, 0.58)),
            Vector((0.05, 0.16, 0.52)),
            height * 0.40,
        ),
    }
    written = []
    for filename, (name, loc, focus, ortho) in views.items():
        if wanted != "all" and filename.split("_", 1)[0] not in wanted.split(","):
            continue
        written.append(shoot(name, loc, focus, ortho, dest / filename))
    return written


def main() -> int:
    assert_not_production_library(CURRENT_PRISM)
    assert_not_production_library(STRAP_BLEND)
    if not GLB.exists():
        raise FileNotFoundError(GLB)
    digest = sha256(GLB)
    if digest != EXPECTED:
        raise SystemExit(f"hash mismatch: {digest}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(GLB))
    from build_final_character_production import snap_and_scale

    snap_and_scale(PIP_HEIGHT)
    body = meshes()[0]
    body.name = "Pip_LongWingOriginal"
    colors, _ = sample_colors(body)
    hide = paint_false_straps(body, colors)
    hits = trace_path(body)
    strap = make_ribbon(hits)
    hardware = add_hardware(hits)
    renders = render_proofs()
    strap_save = None
    if os.environ.get("PIP_STRAP_SAVE", "1") != "0":
        strap_save = save_strap_only(strap, hardware)
    report = {
        "method": "paint-only hide of front backpack risers + front-to-shoulder ribbon meeting the original rear diagonal; no fused-vert flatten",
        "first_flatten_pass_reused": False,
        "current_prism_overwritten": False,
        "production_library_touched": False,
        "canonical_mutated": False,
        "theatrical_bound": False,
        "merge": False,
        "paid_resources": False,
        "reconstructed_glb_committed": False,
        "sha256": digest,
        "hide": hide,
        "shader": None,
        "strap": strap.name,
        "hardware": hardware,
        "hits": [[list(p), list(n)] for p, n in hits],
        "renders": renders,
        "strap_save": strap_save,
        "blend_full_scene": None,
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "PIP_ORIGINAL_STRAP_FIX.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "hits"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
