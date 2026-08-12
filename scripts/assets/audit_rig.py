"""Audit DDP character rigging, skinning and animation inside Blender.

Enumerates meshes, armatures, modifiers, vertex groups, bones, pose bones,
rotation modes, actions, f-curves and keyframes; proves which meshes are really
bound to which armature; then evaluates the rig to prove whether the geometry
actually moves.

Fails closed (exit 2) when any of these hold:
  * an Armature modifier exists but the mesh has no usable vertex groups;
  * an action animates channels incompatible with the bone rotation mode;
  * keyframes exist but the evaluated pose does not change;
  * an action is applied but the evaluated mesh geometry stays static.

Run:
  blender -b -noaudio --python scripts/assets/audit_rig.py -- \
      --blend production-library/characters/pip_production.blend --role pip \
      --out artifacts/rig-audit/pip.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "blender"))
from ddp_rig import (  # noqa: E402
    count_unweighted_vertices,
    fcurve_varies,
    rotation_mode_conflicts,
    sample_local_motion,
)

SAMPLE_FRAMES = [1, 30, 60, 90]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit a DDP character rig.")
    parser.add_argument("--blend", required=True)
    parser.add_argument("--role", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--action", default="", help="action to evaluate for motion (default: role default)")
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    return parser.parse_args(argv)


def audit_meshes(arm) -> list[dict]:
    import bpy

    rows = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        arm_mods = [m for m in obj.modifiers if m.type == "ARMATURE"]
        groups = [vg.name for vg in obj.vertex_groups]
        bone_names = {b.name for b in arm.data.bones} if arm else set()
        rows.append(
            {
                "mesh": obj.name,
                "vertices": len(obj.data.vertices),
                "parent": obj.parent.name if obj.parent else None,
                "parentType": obj.parent_type if obj.parent else None,
                "armatureModifiers": [
                    {"name": m.name, "object": m.object.name if m.object else None} for m in arm_mods
                ],
                "vertexGroupCount": len(groups),
                "vertexGroups": groups,
                "groupsMatchingDeformBones": sorted(set(groups) & bone_names),
                "orphanVertexGroups": sorted(set(groups) - bone_names),
                "unweightedVertices": count_unweighted_vertices(obj),
                "shapeKeys": len(obj.data.shape_keys.key_blocks) if obj.data.shape_keys else 0,
                # A mesh is only truly bound when it has an Armature modifier
                # pointing at the armature AND weights the armature can use.
                "reallyBound": bool(arm_mods)
                and any(m.object is arm for m in arm_mods)
                and len(groups) > 0
                and count_unweighted_vertices(obj) == 0,
            }
        )
    return rows


def audit_armatures() -> list[dict]:
    import bpy

    rows = []
    for obj in bpy.data.objects:
        if obj.type != "ARMATURE":
            continue
        rows.append(
            {
                "armature": obj.name,
                "boneCount": len(obj.data.bones),
                "bones": [
                    {
                        "name": b.name,
                        "parent": b.parent.name if b.parent else None,
                        "useDeform": bool(b.use_deform),
                    }
                    for b in obj.data.bones
                ],
                "poseBoneRotationModes": {pb.name: pb.rotation_mode for pb in obj.pose.bones},
                "distinctRotationModes": sorted({pb.rotation_mode for pb in obj.pose.bones}),
            }
        )
    return rows


def audit_actions(arm) -> list[dict]:
    import bpy

    rows = []
    for action in bpy.data.actions:
        fcurves = list(action.fcurves)
        varying = [fc for fc in fcurves if fcurve_varies(fc)]
        rows.append(
            {
                "action": action.name,
                "fcurves": len(fcurves),
                "varyingFcurves": len(varying),
                "constantFcurves": len(fcurves) - len(varying),
                "keyframes": sum(len(fc.keyframe_points) for fc in fcurves),
                "frameRange": [round(action.frame_range[0], 2), round(action.frame_range[1], 2)],
                "varyingChannels": sorted({f"{fc.data_path}[{fc.array_index}]" for fc in varying}),
                "rotationModeConflicts": rotation_mode_conflicts(arm, action) if arm else [],
                # The exact defect class that shipped: curves exist, none vary.
                "deadAction": len(fcurves) > 0 and len(varying) == 0,
            }
        )
    return sorted(rows, key=lambda r: r["action"])


def main() -> int:
    import bpy

    args = parse_args(sys.argv)
    bpy.ops.wm.open_mainfile(filepath=args.blend)

    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    meshes = audit_meshes(arm)
    armatures = audit_armatures()
    actions = audit_actions(arm)

    # Evaluate the role's headline action for real motion.
    default_action = {"pip": "PIP_POINT", "goat": "GOAT_HEAD_NOD"}.get(args.role, "")
    wanted = args.action or default_action
    action = bpy.data.actions.get(wanted)
    fuzzy = None
    if action is None and wanted:
        fuzzy = [a.name for a in bpy.data.actions if wanted.lower() in a.name.lower()]

    motion = None
    if arm and action:
        if not arm.animation_data:
            arm.animation_data_create()
        arm.animation_data.action = action
        arm.animation_data.action_extrapolation = "HOLD"
        scene = bpy.context.scene
        scene.frame_start = 1
        scene.frame_end = max(SAMPLE_FRAMES)
        mesh_objs = [o for o in bpy.data.objects if o.type == "MESH"]
        motion = sample_local_motion(arm, mesh_objs, SAMPLE_FRAMES)

    deform_bones = {b["name"] for a in armatures for b in a["bones"] if b["useDeform"]}
    skinned = [m for m in meshes if m["armatureModifiers"]]
    failures = []
    for mesh in skinned:
        if mesh["vertexGroupCount"] == 0:
            failures.append(f"{mesh['mesh']}: Armature modifier present but zero vertex groups")
        elif mesh["unweightedVertices"]:
            failures.append(f"{mesh['mesh']}: {mesh['unweightedVertices']} vertices carry no usable weight")
        elif not mesh["groupsMatchingDeformBones"]:
            failures.append(f"{mesh['mesh']}: no vertex group maps to a deform bone")
    for row in actions:
        if row["deadAction"]:
            failures.append(f"{row['action']}: {row['fcurves']} f-curves but none vary (dead action)")
        if row["rotationModeConflicts"]:
            failures.append(
                f"{row['action']}: {len(row['rotationModeConflicts'])} channels animate an ignored rotation mode"
            )
    if wanted and action is None:
        failures.append(f"requested action {wanted!r} does not exist in this blend (fuzzy candidates: {fuzzy})")
    if motion is not None:
        if motion["maxBoneDelta"] <= 1e-4:
            failures.append(f"{wanted}: keyframes exist but evaluated pose never changes")
        if motion["maxVertexDelta"] <= 1e-4:
            failures.append(f"{wanted}: action applied but evaluated mesh geometry stays static")

    report = {
        "role": args.role,
        "blend": args.blend,
        "blenderVersion": bpy.app.version_string,
        "armatures": armatures,
        "meshes": meshes,
        "actions": actions,
        "deformBones": sorted(deform_bones),
        "evaluatedAction": wanted or None,
        "evaluatedActionExists": action is not None,
        "fuzzyCandidates": fuzzy,
        "motion": motion,
        "failures": failures,
        "ok": not failures,
        "status": "PASS" if not failures else "FAIL",
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))
    print("DDP_RIG_AUDIT:" + json.dumps({"role": args.role, "status": report["status"], "failures": failures}))
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
