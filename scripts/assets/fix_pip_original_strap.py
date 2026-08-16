#!/usr/bin/env python3
"""Remove the false left-front satchel riser on the approved original Pip.

Keeps the original rear diagonal. Adds one front diagonal over the
character-right shoulder. Rebuilds the exposed left chest as surrounding
yellow feathers. Does not flatten the whole torso. Does not overwrite
current Prism Pip. Does not write production-library/.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/fix_pip_original_strap.py
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree

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

TEAL = (0.07, 0.26, 0.24)
TEAL_STITCH = (0.04, 0.16, 0.15)
COPPER = (0.62, 0.38, 0.16)
OFFSET = 0.013
STRAP_WIDTH = 0.040
STRAP_THICK = 0.007
SHOULDER_Z_MAX = 1.105
MAX_DISPLACE = 0.038


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
    if world.z > 1.04 and (world.x * world.x + world.y * world.y) < 0.068:
        return True
    if world.z > 1.04 and abs(world.y) < 0.09 and 0.08 < world.x < 0.30:
        return True
    if world.z > 1.04 and abs(world.y) < 0.10 and -0.24 < world.x < 0.05:
        return True
    return False


def in_bag_body(world: Vector) -> bool:
    return world.z < 0.56 and world.x > 0.18 and -0.04 < world.y < 0.26


def in_left_riser(world: Vector) -> bool:
    """Character-left front backpack riser, shoulder down to the satchel."""
    if in_scarf(world) or in_bag_body(world):
        return False
    if world.x < 0.08 or world.y < 0.022 or world.y > 0.22:
        return False
    if world.z < 0.545 or world.z > 1.14:
        return False
    if world.z < 0.62 and world.x > 0.40:
        return False
    if world.z > 1.08 and world.y < 0.055:
        return False
    return True


def in_old_right_vertical(world: Vector) -> bool:
    """Old right-front backpack riser. Paint only; the new diagonal replaces it."""
    if in_scarf(world) or in_bag_body(world):
        return False
    if world.x < 0.10 or world.y > -0.05 or world.y < -0.22:
        return False
    if not (0.56 < world.z < 1.02):
        return False
    return True


def strap_like(col) -> bool:
    r, g, b = col
    if yellow(col):
        return False
    if teal(col):
        return True
    return g > 0.18 and b > 0.10 and r < 0.62 and (b > r - 0.02 or g > r + 0.02)


def chest_feather(col) -> bool:
    """Warm yellow/cream body only. Rejects gold-on-teal strap dots."""
    r, g, b = col
    if teal(col) or strap_like(col):
        return False
    return r > 0.48 and g > 0.38 and b < 0.30 and (r + g) > 0.95 and g > b + 0.16


def color_image():
    return next(
        (
            img
            for img in bpy.data.images
            if img.size[0] > 64 and "color" in img.name.lower() and "normal" not in img.name.lower()
        ),
        None,
    )


def normal_image():
    return next(
        (img for img in bpy.data.images if img.size[0] > 64 and "normal" in img.name.lower()),
        None,
    )


def flood_region(obj, colors, predicate, seeds_need_strap=True) -> set[int]:
    mw = obj.matrix_world
    verts = obj.data.vertices
    adj = adjacency(obj)
    seeds = []
    for vid, col in colors.items():
        world = mw @ verts[vid].co
        if not predicate(world):
            continue
        if seeds_need_strap and not strap_like(col):
            continue
        seeds.append(vid)
    seen = set()
    stack = list(seeds)
    region = set()
    while stack:
        vid = stack.pop()
        if vid in seen:
            continue
        seen.add(vid)
        world = mw @ verts[vid].co
        if not predicate(world):
            continue
        region.add(vid)
        stack.extend(adj[vid])
    return region


def feather_samples(obj, colors):
    """Yellow chest/body verts with world position and a UV for clone-stamp."""
    mw = obj.matrix_world
    verts = obj.data.vertices
    uv = obj.data.uv_layers.active.data if obj.data.uv_layers else None
    samples = []
    uv_of = {}
    if uv is not None:
        for poly in obj.data.polygons:
            for li in poly.loop_indices:
                vid = obj.data.loops[li].vertex_index
                if vid not in uv_of:
                    uv_of[vid] = uv[li].uv.copy()
    for vid, col in colors.items():
        if not chest_feather(col):
            continue
        world = mw @ verts[vid].co
        if in_left_riser(world) or in_old_right_vertical(world) or in_scarf(world) or in_bag_body(world):
            continue
        if world.x < 0.06 or abs(world.y) > 0.20:
            continue
        if not (0.50 < world.z < 1.12):
            continue
        # Prefer the open chest between the two old risers, plus side feathers.
        samples.append((vid, world, uv_of.get(vid), col))
    return samples


def build_kdtree(samples):
    tree = KDTree(len(samples))
    for i, (_vid, world, _uv, _col) in enumerate(samples):
        tree.insert(world, i)
    tree.balance()
    return tree


def nearest_feather(tree, samples, world, n=7):
    hits = tree.find_n(world, n)
    if not hits:
        return None
    return [samples[idx] for _co, idx, _dist in hits if idx < len(samples)]


def settle_left_riser(obj, colors, left_ids, samples, tree) -> dict:
    """Push the raised left column inward in X onto the chest profile."""
    mw = obj.matrix_world
    imw = mw.inverted()
    verts = obj.data.vertices
    profile = defaultdict(list)
    for _vid, pos, _uv, _col in samples:
        if abs(pos.y) < 0.07 and 0.10 < pos.x < 0.36:
            profile[int(pos.z * 25)].append(pos.x)
    chest_x = {k: sorted(xs)[len(xs) // 2] for k, xs in profile.items() if xs}
    moved = 0
    total = 0.0
    for vid in left_ids:
        world = mw @ verts[vid].co
        key = int(world.z * 25)
        target_x = None
        for delta_k in (0, -1, 1, -2, 2):
            if key + delta_k in chest_x:
                target_x = chest_x[key + delta_k] + 0.006
                break
        if target_x is None:
            near = nearest_feather(tree, samples, world, 6)
            if not near:
                continue
            target_x = min(s[1].x for s in near) + 0.006
        if world.x <= target_x + 0.002:
            continue
        new_x = max(target_x, world.x - MAX_DISPLACE)
        verts[vid].co = imw @ Vector((new_x, world.y, world.z))
        moved += 1
        total += world.x - new_x
    obj.data.update()
    return {
        "moved_verts": moved,
        "mean_move": (total / moved) if moved else 0.0,
        "max_allowed": MAX_DISPLACE,
        "profile_bins": len(chest_x),
    }


def clone_stamp(obj, paint_ids, samples, tree, img, nrm_img, kill_ids=None) -> dict:
    """Paint Color (and Normal) from nearby yellow feather texels. No flat fill."""
    import numpy as np

    if img is None or not obj.data.uv_layers:
        return {"painted": 0}
    mw = obj.matrix_world
    verts = obj.data.vertices
    w, h = int(img.size[0]), int(img.size[1])
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape((h, w, 4))
    nrm = None
    nw = nh = 0
    if nrm_img is not None:
        nw, nh = int(nrm_img.size[0]), int(nrm_img.size[1])
        nrm = np.empty(nw * nh * 4, dtype=np.float32)
        nrm_img.pixels.foreach_get(nrm)
        nrm = nrm.reshape((nh, nw, 4))
    uv = obj.data.uv_layers.active.data
    painted = 0
    nrm_painted = 0
    cache = {}

    def feather_color(world):
        key = (round(world.x, 3), round(world.y, 3), round(world.z, 3))
        if key in cache:
            return cache[key]
        near = nearest_feather(tree, samples, world, 6)
        if not near:
            cache[key] = None
            return None
        acc = np.zeros(4, dtype=np.float32)
        nacc = np.zeros(4, dtype=np.float32)
        n = 0
        nn = 0
        for _vid, _pos, suv, col in near:
            if suv is not None:
                sx = min(max(int(suv.x * (w - 1)) % w, 0), w - 1)
                sy = min(max(int(suv.y * (h - 1)) % h, 0), h - 1)
                acc += px[sy, sx]
                n += 1
                if nrm is not None:
                    nx = min(max(int(suv.x * (nw - 1)) % nw, 0), nw - 1)
                    ny = min(max(int(suv.y * (nh - 1)) % nh, 0), nh - 1)
                    nacc += nrm[ny, nx]
                    nn += 1
            else:
                acc += np.array([col[0], col[1], col[2], 1.0], dtype=np.float32)
                n += 1
        if not n:
            cache[key] = None
            return None
        color = acc / n
        ncolor = (nacc / nn) if nn else None
        cache[key] = (color, ncolor)
        return cache[key]

    for poly in obj.data.polygons:
        loops = list(poly.loop_indices)
        vids = [obj.data.loops[li].vertex_index for li in loops]
        marked = [vid in paint_ids for vid in vids]
        if sum(marked) < 1:
            continue
        world = mw @ verts[vids[0]].co
        sampled = feather_color(world)
        if sampled is None:
            continue
        color, ncolor = sampled
        pts = [(float(uv[li].uv.x) * (w - 1), float(uv[li].uv.y) * (h - 1)) for li in loops]
        alphas = [0.96 if flag else 0.20 for flag in marked]
        for i in range(1, len(pts) - 1):
            painted += raster_tri(px, [pts[0], pts[i], pts[i + 1]], [alphas[0], alphas[i], alphas[i + 1]], color, 0.94)
        if nrm is not None and ncolor is not None:
            npts = [(float(uv[li].uv.x) * (nw - 1), float(uv[li].uv.y) * (nh - 1)) for li in loops]
            for i in range(1, len(npts) - 1):
                nrm_painted += raster_tri(
                    nrm, [npts[0], npts[i], npts[i + 1]], [alphas[0], alphas[i], alphas[i + 1]], ncolor, 0.88
                )
    killed = 0
    uv_layer = obj.data.uv_layers.active.data
    kill = set(kill_ids) if kill_ids is not None else paint_ids

    def is_strap_texel(pix):
        r, g, b = float(pix[0]), float(pix[1]), float(pix[2])
        if r > 0.55 and g > 0.45 and b < 0.32:
            return False
        return (b > r + 0.03 and g > r + 0.01 and r < 0.58) or (
            g > 0.20 and b > 0.12 and r < 0.50 and g > r - 0.02
        )

    for poly in obj.data.polygons:
        loops = list(poly.loop_indices)
        vids = [obj.data.loops[li].vertex_index for li in loops]
        if not any(vid in kill for vid in vids):
            continue
        world = mw @ verts[vids[0]].co
        sampled = feather_color(world)
        if sampled is None:
            continue
        color, _ncolor = sampled
        for li, vid in zip(loops, vids):
            if vid not in kill:
                continue
            u, v = uv_layer[li].uv
            cx = min(max(int(u * (w - 1)) % w, 0), w - 1)
            cy = min(max(int(v * (h - 1)) % h, 0), h - 1)
            radius = 8
            y0, y1 = max(cy - radius, 0), min(cy + radius, h - 1)
            x0, x1 = max(cx - radius, 0), min(cx + radius, w - 1)
            patch = px[y0 : y1 + 1, x0 : x1 + 1]
            rr, gg, bb = patch[:, :, 0], patch[:, :, 1], patch[:, :, 2]
            mask = ((bb > rr + 0.03) & (gg > rr + 0.01) & (rr < 0.58)) | (
                (gg > 0.20) & (bb > 0.12) & (rr < 0.50) & (gg > rr - 0.02) & ~((rr > 0.55) & (gg > 0.45) & (bb < 0.32))
            )
            if mask.any():
                patch[mask] = color
                killed += int(mask.sum())
    img.pixels.foreach_set(px.reshape(-1))
    img.update()
    if nrm is not None:
        nrm_img.pixels.foreach_set(nrm.reshape(-1))
        nrm_img.update()
    return {"painted": painted, "normal_painted": nrm_painted, "stamp_cache": len(cache), "teal_killed": killed}


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
    # Keep the ribbon off the scarf tails (center-front / center-back neck).
    if placed.z > 1.02 and abs(placed.y) < 0.14:
        extra = (0.16 - abs(placed.y))
        placed = Vector((placed.x, placed.y - extra if placed.y < 0 else placed.y + extra, min(placed.z, 1.08)))
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
    """Front diagonal only, then the character-right shoulder, meeting the rear."""
    return [
        (Vector((0.70, 0.16, 0.52)), Vector((0.20, 0.15, 0.50))),
        (Vector((0.70, 0.10, 0.62)), Vector((0.12, 0.08, 0.60))),
        (Vector((0.68, 0.04, 0.72)), Vector((0.08, 0.02, 0.70))),
        (Vector((0.66, -0.02, 0.82)), Vector((0.06, -0.04, 0.80))),
        (Vector((0.64, -0.08, 0.92)), Vector((0.04, -0.10, 0.90))),
        (Vector((0.56, -0.16, 1.00)), Vector((0.04, -0.16, 0.98))),
        (Vector((0.40, -0.26, 1.04)), Vector((0.02, -0.20, 1.00))),
        (Vector((0.20, -0.38, 1.06)), Vector((0.00, -0.22, 1.00))),
        (Vector((0.02, -0.42, 1.06)), Vector((0.00, -0.22, 1.00))),
        (Vector((-0.14, -0.40, 1.04)), Vector((0.00, -0.20, 0.98))),
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
    if len(hits) < 7:
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


def make_chest_patch(obj) -> bpy.types.Object | None:
    """Cover the leftover left riser with a yellow-feather surface patch."""
    aims = [
        (Vector((0.62, 0.14, 1.06)), Vector((0.08, 0.12, 1.04))),
        (Vector((0.64, 0.13, 0.96)), Vector((0.08, 0.11, 0.94))),
        (Vector((0.66, 0.12, 0.86)), Vector((0.08, 0.10, 0.84))),
        (Vector((0.66, 0.11, 0.76)), Vector((0.08, 0.10, 0.74))),
        (Vector((0.66, 0.11, 0.66)), Vector((0.10, 0.10, 0.64))),
        (Vector((0.64, 0.12, 0.58)), Vector((0.12, 0.11, 0.56))),
    ]
    hits = []
    for src, dst in aims:
        hit = ray_hit_multi(obj, src, dst)
        if hit is not None:
            hits.append(hit)
    if len(hits) < 4:
        return None
    hits = smooth_hits(hits)
    verts = []
    faces = []
    n = len(hits)
    half_w = 0.034
    prev_side = None
    for i in range(n):
        loc, _tangent, nrm, side = _frame(hits, i, prev_side)
        prev_side = side
        # Sit just above the repaired chest.
        loc = loc + nrm * 0.004
        verts.extend(
            [
                loc + side * half_w + nrm * 0.003,
                loc - side * half_w + nrm * 0.003,
                loc - side * half_w,
                loc + side * half_w,
            ]
        )
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
    mesh = bpy.data.meshes.new("Pip_LeftChestPatchMesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    patch = bpy.data.objects.new("Pip_LeftChestPatch", mesh)
    bpy.context.collection.objects.link(patch)
    mat = principled_mat("Pip_LeftChestPatchMat", (0.86, 0.78, 0.32), roughness=0.62, specular=0.12, sheen=0.20)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 38.0
    noise.inputs["Detail"].default_value = 6.0
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MIX"
    mix.inputs["Fac"].default_value = 0.28
    mix.inputs["Color1"].default_value = (0.88, 0.80, 0.36, 1.0)
    mix.inputs["Color2"].default_value = (0.76, 0.68, 0.20, 1.0)
    nt.links.new(noise.outputs["Fac"], mix.inputs["Fac"])
    nt.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    patch.data.materials.append(mat)
    for poly in patch.data.polygons:
        poly.use_smooth = True
    return patch


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
        verts.extend(
            [
                loc + side * half_w + nrm * STRAP_THICK,
                loc - side * half_w + nrm * STRAP_THICK,
                loc - side * half_w + nrm * 0.0015,
                loc + side * half_w + nrm * 0.0015,
            ]
        )
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
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[mesh.loops[li].vertex_index]
    obj = bpy.data.objects.new("Pip_CrossbodyStrap", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(strap_material())
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def strap_material():
    mat = principled_mat("Pip_CrossbodyStrapMat", TEAL, roughness=0.52, specular=0.18, sheen=0.14)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tex.outputs["UV"], sep.inputs["Vector"])
    edge = nt.nodes.new("ShaderNodeMath")
    edge.operation = "PINGPONG"
    edge.inputs[1].default_value = 0.5
    nt.links.new(sep.outputs["X"], edge.inputs[0])
    stitch = nt.nodes.new("ShaderNodeMath")
    stitch.operation = "COMPARE"
    stitch.inputs[1].default_value = 0.11
    stitch.inputs[2].default_value = 0.022
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
    right_front = min(
        range(n),
        key=lambda i: hits[i][0].y - hits[i][0].x * 0.2 if hits[i][0].z > 0.96 and hits[i][0].x > 0 else 99,
    )
    picks = [(0, "bag_front"), (right_front, "right_shoulder_front")]
    for idx, label in picks:
        loc, tangent, nrm, _side = _frame(hits, idx)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc + nrm * (STRAP_THICK * 0.7))
        buckle = bpy.context.active_object
        buckle.name = f"Pip_StrapBuckle_{label}"
        buckle.scale = (STRAP_WIDTH * 0.38, 0.014, 0.005)
        buckle.rotation_euler = tangent.to_track_quat("Y", "Z").to_matrix().to_4x4().to_euler()
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


def leftover_left_teal(obj, colors) -> dict:
    mw = obj.matrix_world
    verts = obj.data.vertices
    n = 0
    for vid, col in colors.items():
        if not strap_like(col):
            continue
        world = mw @ verts[vid].co
        if in_left_riser(world):
            n += 1
    return {"left_riser_straplike_after_paint_sample": n}


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
            Vector((0.42, -0.26, 1.12)),
            Vector((0.04, -0.18, 1.08)),
            height * 0.38,
        ),
        "08_left_shoulder_closeup.png": (
            "l_shoulder",
            Vector((0.42, 0.22, 1.12)),
            Vector((0.08, 0.10, 1.06)),
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
    left_ids = flood_region(body, colors, in_left_riser)
    adj = adjacency(body)
    extra = set()
    mw = body.matrix_world
    for vid in left_ids:
        for nb in adj[vid]:
            if in_left_riser(mw @ body.data.vertices[nb].co):
                extra.add(nb)
    left_ids = set(left_ids) | extra
    right_ids = flood_region(body, colors, in_old_right_vertical)
    samples = feather_samples(body, colors)
    tree = build_kdtree(samples)
    settle = settle_left_riser(body, colors, left_ids, samples, tree)
    paint_ids = set(left_ids) | set(right_ids)
    paint = clone_stamp(body, paint_ids, samples, tree, color_image(), normal_image(), kill_ids=left_ids)
    hits = trace_path(body)
    strap = make_ribbon(hits)
    hardware = add_hardware(hits)
    leftover = leftover_left_teal(body, colors)
    renders = render_proofs()
    strap_save = None
    if os.environ.get("PIP_STRAP_SAVE", "1") != "0":
        strap_save = save_strap_only(strap, hardware)
    report = {
        "method": "gentle left-riser surface-match + feather clone-stamp; front diagonal ribbon; original rear kept",
        "first_flatten_pass_reused": False,
        "current_prism_overwritten": False,
        "production_library_touched": False,
        "canonical_mutated": False,
        "theatrical_bound": False,
        "merge": False,
        "paid_resources": False,
        "reconstructed_glb_committed": False,
        "sha256": digest,
        "left_riser_verts": len(left_ids),
        "old_right_vertical_verts": len(right_ids),
        "feather_samples": len(samples),
        "settle": settle,
        "paint": paint,
        "leftover": leftover,
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
