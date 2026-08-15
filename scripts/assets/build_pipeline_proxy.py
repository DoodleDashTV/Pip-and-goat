#!/usr/bin/env python3
"""Build a clearly labeled PROXY bird for pipeline tests.

Not Pip. Not Goat. Not canon. Not theatrical-bound. Never written to
production-library/. Used only where a character stand-in is required.

  /usr/local/bin/blender -b -noaudio -P scripts/assets/build_pipeline_proxy.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "assets"))

from theatrical_rebuild_common import assert_not_production_library  # noqa: E402
from theatrical_v1_common import link, principled_mat, reset_scene  # noqa: E402

OUT = REPO / "theatrical-foundation/proposed/pipeline-proxy/PROXY_PIPELINE_BIRD.blend"
REPORT = REPO / "theatrical-foundation/proposed/pipeline-proxy/PROXY_PIPELINE_BIRD.json"


def mark_proxy(obj, role: str) -> None:
    obj["ddp_proxy"] = True
    obj["ddp_approved"] = False
    obj["ddp_theatrical_bound"] = False
    obj["ddp_not_pip"] = True
    obj["ddp_not_goat"] = True
    obj["ddp_proxy_role"] = role
    obj.display_type = "TEXTURED"


def add_mesh(name, primitive, **kwargs):
    primitive(**kwargs)
    obj = bpy.context.object
    obj.name = name
    mark_proxy(obj, name)
    return obj


def build_armature():
    data = bpy.data.armatures.new("PROXY_PIPELINE_RIG")
    arm = bpy.data.objects.new("PROXY_PIPELINE_RIG", data)
    link(arm)
    mark_proxy(arm, "armature")
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    bones = {
        "root": ((0, 0, 0), (0, 0, 0.25), None),
        "spine": ((0, 0, 0.25), (0, 0, 0.85), "root"),
        "head": ((0, 0, 0.85), (0, 0, 1.25), "spine"),
        "wing_L": ((0, 0.12, 0.75), (0, 0.55, 0.70), "spine"),
        "wing_R": ((0, -0.12, 0.75), (0, -0.55, 0.70), "spine"),
        "leg_L": ((0, 0.08, 0.25), (0, 0.10, 0.02), "root"),
        "leg_R": ((0, -0.08, 0.25), (0, -0.10, 0.02), "root"),
    }
    created = {}
    for name, (head, tail, parent) in bones.items():
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        if parent:
            bone.parent = created[parent]
        created[name] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def bind(obj, arm):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")


def main() -> int:
    assert_not_production_library(OUT)
    reset_scene()
    body = add_mesh("PROXY_PIPELINE_BIRD_BODY", bpy.ops.mesh.primitive_uv_sphere_add, radius=0.38, location=(0, 0, 0.62))
    head = add_mesh("PROXY_PIPELINE_BIRD_HEAD", bpy.ops.mesh.primitive_uv_sphere_add, radius=0.22, location=(0.08, 0, 1.05))
    wing_l = add_mesh("PROXY_PIPELINE_BIRD_WING_L", bpy.ops.mesh.primitive_cube_add, size=0.18, location=(0.02, 0.38, 0.70))
    wing_r = add_mesh("PROXY_PIPELINE_BIRD_WING_R", bpy.ops.mesh.primitive_cube_add, size=0.18, location=(0.02, -0.38, 0.70))
    wing_l.scale = Vector((1.6, 2.4, 0.25))
    wing_r.scale = Vector((1.6, 2.4, 0.25))
    scarf = add_mesh("PROXY_PIPELINE_BIRD_SCARF", bpy.ops.mesh.primitive_torus_add, location=(0.04, 0, 0.88), major_radius=0.16, minor_radius=0.03)
    crest = []
    for index, y in enumerate((-0.05, 0.0, 0.05)):
        feather = add_mesh(
            f"PROXY_PIPELINE_BIRD_CREST_{index + 1}",
            bpy.ops.mesh.primitive_cone_add,
            radius1=0.03,
            depth=0.16,
            location=(0.02, y, 1.28),
        )
        crest.append(feather)
    yellow = principled_mat("PROXY_YELLOW", (0.82, 0.76, 0.18), roughness=0.42)
    teal = principled_mat("PROXY_TEAL", (0.10, 0.46, 0.48), roughness=0.35)
    coral = principled_mat("PROXY_CORAL", (0.84, 0.34, 0.24), roughness=0.4)
    body.data.materials.append(yellow)
    head.data.materials.append(yellow)
    wing_l.data.materials.append(yellow)
    wing_r.data.materials.append(yellow)
    scarf.data.materials.append(teal)
    for feather in crest:
        feather.data.materials.append(coral)
    arm = build_armature()
    for obj in (body, head, wing_l, wing_r, scarf, *crest):
        bind(obj, arm)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT), compress=True)
    payload = {
        "label": "PROXY_PIPELINE_BIRD",
        "approved": False,
        "isPip": False,
        "isGoat": False,
        "canonicalMutated": False,
        "theatricalBound": False,
        "productionLibraryTouched": False,
        "path": str(OUT.relative_to(REPO)),
        "objects": [obj.name for obj in bpy.data.objects],
        "purpose": "Pipeline and deformation tests only.",
    }
    REPORT.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({"ok": True, "proxy": payload["path"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
