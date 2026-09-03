#!/usr/bin/env python3
"""Identify which object paints the locked-camera horizon salmon band.

Does not mutate production materials permanently. Writes a unique-color
still and a JSON of candidate objects intersecting the far camera frustum.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

_THIS = Path(__file__).resolve()
_ROOT = _THIS.parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import bpy

from scripts.blender.forest_botaniq_production_recovery_v1 import (
    apply_botaniq_production_recovery,
    load_owned_hdri,
)
from scripts.blender.forest_camera_ground_cover_v1 import apply_camera_ground_cover
from scripts.blender.forest_lookdev_isolation_v1 import isolate_production, restore_production
from scripts.blender.stagegraph.vendor_reference_render_v1 import (
    CAMERA_NAME,
    LOOK,
    VENDOR_CAMERA_LOC,
    build_scene,
)


def _unique_mat(name: str, rgb: tuple[float, float, float]) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*rgb, 1.0)
    em.inputs["Strength"].default_value = 1.0
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-id", required=True)
    ap.add_argument("--owned-hdri", required=True)
    ap.add_argument("--out-json", required=True)
    ap.add_argument("--out-png", required=True)
    args = ap.parse_args()

    scene = bpy.context.scene
    build_scene(scene, source_id=args.source_id)
    apply_botaniq_production_recovery(scene, mode="production")
    apply_camera_ground_cover(scene)
    load_owned_hdri(scene, args.owned_hdri)

    cam = bpy.data.objects.get(CAMERA_NAME)
    assert cam is not None
    cam.location = VENDOR_CAMERA_LOC
    scene.camera = cam

    # Hide the dressing so we only see locked/base objects.
    col = bpy.data.collections.get("TJ_CAMERA_GROUND_COVER_V1")
    if col:
        col.hide_render = True
        col.hide_viewport = True

    vg = bpy.data.objects.get("TJ_VendorGround")
    if vg:
        vg.hide_render = True

    candidates = []
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        if obj.name.startswith("TJ_GC_"):
            continue
        if obj.hide_render or obj.hide_get():
            continue
        corners = [obj.matrix_world @ v.co for v in obj.bound_box]
        ys = [c.y for c in corners]
        zs = [c.z for c in corners]
        xs = [c.x for c in corners]
        if max(ys) < 8.0:
            continue
        if max(zs) < 0.0 or min(zs) > 8.0:
            continue
        candidates.append({
            "name": obj.name,
            "verts": len(obj.data.vertices),
            "x": [min(xs), max(xs)],
            "y": [min(ys), max(ys)],
            "z": [min(zs), max(zs)],
            "materials": [s.material.name if s.material else None for s in obj.material_slots],
        })

    # Paint atmosphere MAGENTA, vendor terrain CYAN, EcoKit florals LIME,
    # remaining wide meshes ORANGE so the horizon band is identifiable.
    atm = _unique_mat("TJ_Diag_Atmosphere", (1.0, 0.0, 1.0))
    cyan = _unique_mat("TJ_Diag_Terrain", (0.0, 1.0, 1.0))
    lime = _unique_mat("TJ_Diag_Floral", (0.2, 1.0, 0.0))
    orange = _unique_mat("TJ_Diag_Other", (1.0, 0.4, 0.0))
    world_em = _unique_mat("TJ_Diag_WorldProxy", (0.0, 0.0, 1.0))

    for obj in scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        name = obj.name
        if name.startswith("TJ_GC_"):
            continue
        if "Atmosphere" in name:
            obj.data.materials.clear()
            obj.data.materials.append(atm)
        elif "Terrain" in name or "terrain" in name.lower():
            obj.data.materials.clear()
            obj.data.materials.append(cyan)
        elif name.startswith("TJ_EcoKitFloral"):
            obj.data.materials.clear()
            obj.data.materials.append(lime)
        elif max(abs(obj.dimensions.x), abs(obj.dimensions.y)) > 20.0:
            obj.data.materials.clear()
            obj.data.materials.append(orange)

    # Make world solid blue so HDRI is distinguishable.
    world = scene.world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (0.0, 0.0, 1.0, 1.0)
    bg.inputs["Strength"].default_value = 1.0
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 4
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.filepath = os.path.abspath(args.out_png)
    isolate_production(scene)
    bpy.ops.render.render(write_still=True)
    restore_production(scene)

    Path(args.out_json).write_text(json.dumps({
        "candidates": candidates,
        "legend": {
            "magenta": "Atmosphere",
            "cyan": "Terrain*",
            "lime": "TJ_EcoKitFloral*",
            "orange": "other wide mesh",
            "blue": "world/HDRI replacement",
            "other": "remaining locked objects",
        },
        "png": args.out_png,
    }, indent=2) + "\n")
    print(f"HORIZON_DIAG wrote {args.out_png} candidates={len(candidates)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
