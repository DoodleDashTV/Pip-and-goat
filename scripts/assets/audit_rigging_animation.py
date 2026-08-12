"""
Evidence-only audit of Pip + Goat rigging/animation (no writes to masters).

Reports binding, rotation modes, f-curve channels, evaluated bone motion,
and evaluated mesh geometry changes across sample frames.
Camera motion is intentionally ignored.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

ROOT = Path(os.environ.get("REPO_ROOT", "/tmp/ddp-rigging-repair"))
OUT = ROOT / "artifacts/performance/rigging-audit"
# Equivalent samples for 30-frame clips. 1/30/60/90 collapses to rest/hold for
# cyclic actions (sin returns to 0 at frame 30; 60/90 hold), falsely hiding motion.
SAMPLE_FRAMES = [1, 10, 20, 30]
LEGACY_SAMPLE_FRAMES = [1, 30, 60, 90]
ACTIONS = {
    "pip": "PIP_POINT",
    "goat": "GOAT_HEAD_NOD",
}
MESH_MOTION_MIN = 0.02  # max vertex delta (meters)
BONE_MOTION_MIN = 0.015  # bone tip delta (meters)
BLENDS = {
    "pip": ROOT / "assets/characters/pip/pip_v1_1.blend",
    "goat": ROOT / "assets/characters/goat/goat_v1_1.blend",
}
PROD = {
    "pip": ROOT / "production-library/characters/pip_production.blend",
    "goat": ROOT / "production-library/characters/goat_production.blend",
}


def append_blend(path: Path):
    import bpy

    with bpy.data.libraries.load(str(path), link=False) as (data_from, data_to):
        data_to.objects = list(data_from.objects)
        data_to.actions = list(data_from.actions)
        data_to.armatures = list(data_from.armatures)
    imported = []
    for obj in data_to.objects:
        if obj is not None:
            bpy.context.collection.objects.link(obj)
            imported.append(obj)
    return imported


def find_arm(objs):
    for o in objs:
        if o.type == "ARMATURE":
            return o
    return None


def find_mesh(objs, needle):
    for o in objs:
        if o.type == "MESH" and needle in o.name:
            return o
    return None


def find_action(name: str):
    import bpy

    for a in bpy.data.actions:
        if a.name == name or a.name.endswith(name) or name in a.name:
            return a
    return None


def fcurve_summary(action):
    rows = []
    if not action:
        return rows
    for fc in action.fcurves:
        keys = list(fc.keyframe_points)
        vals = [kp.co.y for kp in keys]
        rows.append(
            {
                "data_path": fc.data_path,
                "array_index": fc.array_index,
                "keyframes": len(keys),
                "min": min(vals) if vals else None,
                "max": max(vals) if vals else None,
                "delta": (max(vals) - min(vals)) if vals else 0.0,
            }
        )
    return rows


def mesh_bounds(obj):
    import bpy
    from mathutils import Vector

    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    coords = [ev.matrix_world @ v.co for v in ev.data.vertices]
    if not coords:
        return None
    xs = [c.x for c in coords]
    ys = [c.y for c in coords]
    zs = [c.z for c in coords]
    mn = Vector((min(xs), min(ys), min(zs)))
    mx = Vector((max(xs), max(ys), max(zs)))
    center = (mn + mx) * 0.5
    return {
        "min": [round(v, 6) for v in mn],
        "max": [round(v, 6) for v in mx],
        "center": [round(v, 6) for v in center],
        "diag": round((mx - mn).length, 6),
        "vertCount": len(coords),
        "coords": coords,
    }


def bone_tip_world(arm, pb):
    from mathutils import Vector

    # Blender bones are Y-aligned in bone space.
    return (arm.matrix_world @ pb.matrix) @ Vector((0.0, pb.length, 0.0))


def sample_motion(arm, mesh, action_name: str):
    import bpy
    from mathutils import Vector

    action = find_action(action_name)
    if arm and action:
        if not arm.animation_data:
            arm.animation_data_create()
        arm.animation_data.action = action

    bone_samples = []
    mesh_samples = []
    for frame in SAMPLE_FRAMES:
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        bones = {}
        if arm:
            for pb in arm.pose.bones:
                mw = arm.matrix_world @ pb.matrix
                loc = mw.to_translation()
                tip = bone_tip_world(arm, pb)
                quat = mw.to_quaternion()
                bones[pb.name] = {
                    "rotation_mode": pb.rotation_mode,
                    "location": [round(v, 6) for v in loc],
                    "tip": [round(v, 6) for v in tip],
                    "quaternion": [round(v, 6) for v in quat],
                    "euler_prop": [round(v, 6) for v in pb.rotation_euler],
                    "quat_prop": [round(v, 6) for v in pb.rotation_quaternion],
                }
        bounds = mesh_bounds(mesh) if mesh else None
        mesh_samples.append(
            {
                "frame": frame,
                "bounds": None
                if not bounds
                else {k: v for k, v in bounds.items() if k != "coords"},
                "_coords": None if not bounds else bounds["coords"],
            }
        )
        bone_samples.append({"frame": frame, "bones": bones})

    # Character motion = evaluated mesh vertex change / bone tip change; never camera.
    mesh_center_delta = 0.0
    max_vert_delta = 0.0
    centers = [s["bounds"]["center"] for s in mesh_samples if s.get("bounds")]
    if len(centers) >= 2:
        c0 = Vector(centers[0])
        mesh_center_delta = max((Vector(c) - c0).length for c in centers)
    coords0 = mesh_samples[0].get("_coords") if mesh_samples else None
    if coords0:
        for sample in mesh_samples[1:]:
            coords = sample.get("_coords") or []
            if len(coords) != len(coords0):
                continue
            for a, b in zip(coords0, coords):
                max_vert_delta = max(max_vert_delta, (a - b).length)

    bone_delta = 0.0
    if bone_samples and bone_samples[0]["bones"]:
        names = bone_samples[0]["bones"].keys()
        for name in names:
            p0 = Vector(bone_samples[0]["bones"][name]["tip"])
            for sample in bone_samples[1:]:
                p = Vector(sample["bones"][name]["tip"])
                bone_delta = max(bone_delta, (p - p0).length)

    # Strip heavy coords before serialization.
    for sample in mesh_samples:
        sample.pop("_coords", None)

    return {
        "actionFound": bool(action),
        "actionName": action.name if action else None,
        "fcurves": fcurve_summary(action),
        "boneSamples": bone_samples,
        "meshSamples": mesh_samples,
        "meshCenterDelta": round(mesh_center_delta, 6),
        "maxVertexDelta": round(max_vert_delta, 6),
        "boneWorldDelta": round(bone_delta, 6),
        "meaningfulMeshMotion": max_vert_delta >= MESH_MOTION_MIN,
        "meaningfulBoneMotion": bone_delta >= BONE_MOTION_MIN,
    }


def audit_character(role: str, path: Path):
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = append_blend(path)
    arm = find_arm(objs)
    mesh_name = "Pip_Character" if role == "pip" else "Goat_Character"
    mesh = find_mesh(objs, mesh_name)
    accessories = [o.name for o in objs if o.type == "MESH" and o != mesh]

    modifiers = []
    vgroups = []
    if mesh:
        for m in mesh.modifiers:
            modifiers.append(
                {
                    "name": m.name,
                    "type": m.type,
                    "object": getattr(m, "object", None).name if getattr(m, "object", None) else None,
                    "use_vertex_groups": getattr(m, "use_vertex_groups", None),
                    "use_bone_envelopes": getattr(m, "use_bone_envelopes", None),
                }
            )
        vgroups = [
            {"name": g.name, "size": len([v for v in mesh.data.vertices if g.index < len(v.groups) and any(gg.group == g.index and gg.weight > 0 for gg in v.groups)])}
            for g in mesh.vertex_groups
        ]
        # simpler non-zero weight count
        nonzero = {}
        for g in mesh.vertex_groups:
            count = 0
            for v in mesh.data.vertices:
                for gg in v.groups:
                    if gg.group == g.index and gg.weight > 1e-6:
                        count += 1
                        break
            nonzero[g.name] = count
        vgroups = [{"name": k, "weightedVerts": v} for k, v in nonzero.items()]

    bones = []
    if arm:
        for b in arm.data.bones:
            bones.append(
                {
                    "name": b.name,
                    "parent": b.parent.name if b.parent else None,
                    "use_deform": b.use_deform,
                    "head": [round(v, 6) for v in b.head_local],
                    "tail": [round(v, 6) for v in b.tail_local],
                }
            )

    pose_modes = {}
    if arm:
        for pb in arm.pose.bones:
            pose_modes[pb.name] = pb.rotation_mode

    parenting = {
        "meshParent": mesh.parent.name if mesh and mesh.parent else None,
        "meshParentType": mesh.parent_type if mesh else None,
        "meshParentBone": mesh.parent_bone if mesh else None,
    }

    motion = sample_motion(arm, mesh, ACTIONS[role])

    euler_channels = [c for c in motion["fcurves"] if "rotation_euler" in c["data_path"]]
    quat_channels = [c for c in motion["fcurves"] if "rotation_quaternion" in c["data_path"]]
    loc_channels = [c for c in motion["fcurves"] if c["data_path"].endswith("location")]

    binding_valid = bool(
        mesh
        and arm
        and any(m["type"] == "ARMATURE" and m["object"] == arm.name for m in modifiers)
        and any(g["weightedVerts"] > 0 for g in vgroups)
    )
    channels_valid = bool(
        motion["actionFound"]
        and (
            (any(c["delta"] > 1e-4 for c in euler_channels) and all(m == "XYZ" or m.startswith("XYZ") or "EULER" in m or m in {"XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"} for m in pose_modes.values()))
            or any(c["delta"] > 1e-4 for c in quat_channels)
            or any(c["delta"] > 1e-4 for c in loc_channels)
        )
        and motion["meaningfulBoneMotion"]
    )
    # Stricter channel validity: keyed channel type must match rotation mode.
    mode_mismatch = False
    if euler_channels and any(m == "QUATERNION" for m in pose_modes.values()):
        mode_mismatch = True

    return {
        "role": role,
        "blend": str(path),
        "armature": arm.name if arm else None,
        "mesh": mesh.name if mesh else None,
        "accessories": accessories,
        "bones": bones,
        "poseRotationModes": pose_modes,
        "modifiers": modifiers,
        "vertexGroups": vgroups,
        "parenting": parenting,
        "motion": {
            "actionFound": motion["actionFound"],
            "actionName": motion["actionName"],
            "fcurveCount": len(motion["fcurves"]),
            "eulerChannelCount": len(euler_channels),
            "quatChannelCount": len(quat_channels),
            "locationChannelCount": len(loc_channels),
            "eulerMaxDelta": max((c["delta"] for c in euler_channels), default=0.0),
            "meshCenterDelta": motion["meshCenterDelta"],
            "maxVertexDelta": motion["maxVertexDelta"],
            "boneWorldDelta": motion["boneWorldDelta"],
            "meaningfulMeshMotion": motion["meaningfulMeshMotion"],
            "meaningfulBoneMotion": motion["meaningfulBoneMotion"],
            "sampleFrames": SAMPLE_FRAMES,
            "legacySampleFramesNote": {
                "legacy": LEGACY_SAMPLE_FRAMES,
                "whyNotUsed": "For 30-frame cyclic clips, frames 30/60/90 are rest/hold and hide real mid-clip motion.",
            },
            "meshSamples": motion["meshSamples"],
            "modeMismatchEulerOnQuaternionBones": mode_mismatch,
        },
        "checks": {
            "RIG_BINDING_VALID": binding_valid,
            "ANIMATION_CHANNELS_VALID": bool(
                motion["actionFound"]
                and not mode_mismatch
                and any(m == "XYZ" for m in pose_modes.values())
                and (
                    any(c["delta"] > 1e-4 for c in euler_channels)
                    or any(c["delta"] > 1e-4 for c in loc_channels)
                )
                and motion["meaningfulBoneMotion"]
            ),
            "PIP_MOTION_VALID" if role == "pip" else "GOAT_MOTION_VALID": bool(
                motion["meaningfulMeshMotion"] and binding_valid and not mode_mismatch and motion["meaningfulBoneMotion"]
            ),
        },
        "rigStrategyHypothesis": (
            "intended_deform_rig_missing_weights"
            if mesh and any(m["type"] == "ARMATURE" for m in modifiers) and not any(g["weightedVerts"] > 0 for g in vgroups)
            else "deform_rig"
            if any(g["weightedVerts"] > 0 for g in vgroups)
            else "unknown"
        ),
    }


def main():
    import bpy

    OUT.mkdir(parents=True, exist_ok=True)
    report = {
        "sampleFrames": SAMPLE_FRAMES,
        "cameraMotionCountedAsCharacterMotion": False,
        "assets": {},
        "productionLibrary": {},
    }
    for role, path in BLENDS.items():
        report["assets"][role] = audit_character(role, path)
    for role, path in PROD.items():
        report["productionLibrary"][role] = audit_character(role, path)

    checks = {
        "RIG_BINDING_VALID": all(
            report["assets"][r]["checks"]["RIG_BINDING_VALID"] for r in ("pip", "goat")
        ),
        "PIP_MOTION_VALID": report["assets"]["pip"]["checks"]["PIP_MOTION_VALID"],
        "GOAT_MOTION_VALID": report["assets"]["goat"]["checks"]["GOAT_MOTION_VALID"],
        "ANIMATION_CHANNELS_VALID": all(
            report["assets"][r]["checks"]["ANIMATION_CHANNELS_VALID"] for r in ("pip", "goat")
        ),
    }
    report["summaryChecks"] = checks
    report["status"] = "PASS" if all(checks.values()) else "FAIL"

    out_path = OUT / "rigging-animation-audit.json"
    out_path.write_text(json.dumps(report, indent=2) + "\n")
    print("RIGGING_AUDIT " + json.dumps({"status": report["status"], "checks": checks, "out": str(out_path)}))


if __name__ == "__main__":
    main()
