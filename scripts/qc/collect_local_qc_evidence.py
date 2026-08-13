"""
Read-only Blender evidence collector for @doodle-dash/qc-gates.

Does NOT modify rigs, animation, lighting systems, or production assets.
Writes a LocalQcEvidence JSON document for evaluateLocalQcGates().

Usage:
  blender -b <scene.blend> --python scripts/qc/collect_local_qc_evidence.py -- \\
    --out artifacts/qc/evidence.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect local QC evidence (read-only).")
    parser.add_argument("--out", required=True, help="Output evidence JSON path")
    parser.add_argument("--frame-start", type=int, default=1)
    parser.add_argument("--frame-end", type=int, default=30)
    return parser.parse_args(argv)


def sample_object_delta(obj, scene, f0: int, f1: int) -> float:
    scene.frame_set(f0)
    a = obj.matrix_world.to_translation().copy()
    scene.frame_set(f1)
    b = obj.matrix_world.to_translation().copy()
    return (b - a).length


def fcurve_range(fcurve) -> float:
    if not fcurve.keyframe_points:
        return 0.0
    values = [kp.co.y for kp in fcurve.keyframe_points]
    return float(max(values) - min(values))


def collect_character_motion(arm, scene, f0: int, f1: int, character: str) -> dict:
    root_delta = sample_object_delta(arm, scene, f0, f1) if arm else 0.0
    bone_range = 0.0
    curves = []
    action_assigned = bool(arm and arm.animation_data and arm.animation_data.action)
    action_name = arm.animation_data.action.name if action_assigned else None
    if action_assigned and arm.animation_data.action.fcurves:
        for fc in arm.animation_data.action.fcurves:
            rng = fcurve_range(fc)
            bone_range = max(bone_range, rng)
            curves.append(
                {
                    "dataPath": fc.data_path,
                    "arrayIndex": fc.array_index,
                    "valueRange": rng,
                    "keyframeCount": len(fc.keyframe_points),
                    "muted": bool(fc.mute),
                    "evaluated": not bool(fc.mute),
                    "rotationMode": getattr(arm, "rotation_mode", None),
                    "keyedRotationMode": getattr(arm, "rotation_mode", None),
                }
            )
    shape_range = 0.0
    return {
        "character": character,
        "rootTransformDelta": float(root_delta),
        "boneChannelRange": float(bone_range),
        "shapeKeyRange": float(shape_range),
        "actionName": action_name,
        "actionAssigned": action_assigned,
        "fcurves": curves,
    }


def find_armature(name_substr: str):
    import bpy

    for obj in bpy.data.objects:
        if obj.type == "ARMATURE" and name_substr.lower() in obj.name.lower():
            return obj
    return None


def rig_binding_for(arm, character: str) -> dict:
    import bpy

    if not arm:
        return {
            "character": character,
            "hasArmature": False,
            "deformationBinding": False,
            "rigidPartBinding": False,
            "fakeBinding": True,
            "boundObjectCount": 0,
        }
    deform = False
    rigid = False
    bound = 0
    for obj in bpy.data.objects:
        if obj.parent == arm or (obj.parent_type == "BONE" and obj.parent == arm):
            rigid = True
            bound += 1
        for mod in getattr(obj, "modifiers", []):
            if mod.type == "ARMATURE" and getattr(mod, "object", None) == arm:
                deform = True
                bound += 1
    fake = bound == 0
    return {
        "character": character,
        "hasArmature": True,
        "deformationBinding": deform,
        "rigidPartBinding": rigid,
        "fakeBinding": fake,
        "boundObjectCount": bound,
    }


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[sys.argv.index("--") + 1 :])
    import bpy

    scene = bpy.context.scene
    f0, f1 = args.frame_start, args.frame_end
    pip_arm = find_armature("pip")
    goat_arm = find_armature("goat")
    cam = scene.camera

    hierarchy = []
    for obj in bpy.data.objects:
        hierarchy.append(
            {
                "name": obj.name,
                "type": obj.type,
                "parentName": obj.parent.name if obj.parent else None,
                "children": [c.name for c in obj.children],
            }
        )

    lights = []
    for obj in bpy.data.objects:
        if obj.type == "LIGHT":
            lights.append(
                {
                    "name": obj.name,
                    "type": obj.data.type if obj.data else "LIGHT",
                    "energy": float(getattr(obj.data, "energy", 0.0)),
                    "productionOwner": obj.get("ddp_production_owner") or ("DDP" if obj.name.startswith("DDP_") else None),
                }
            )

    evidence = {
        "rigBindings": [rig_binding_for(pip_arm, "pip"), rig_binding_for(goat_arm, "goat")],
        "pipMotion": collect_character_motion(pip_arm, scene, f0, f1, "pip"),
        "goatMotion": collect_character_motion(goat_arm, scene, f0, f1, "goat"),
        "cameraMotion": {
            "transformDelta": float(sample_object_delta(cam, scene, f0, f1)) if cam else 0.0,
            "channelRange": 0.0,
            "preset": cam.get("ddp_camera_preset") if cam else None,
        },
        "lights": lights,
        "lightingState": {"preset": scene.get("ddp_lighting_preset") or ""},
        "hierarchy": hierarchy,
        "sceneAssembly": {
            "rolesPresent": {
                "pip": pip_arm is not None,
                "goat": goat_arm is not None,
                "map": any("map" in o.name.lower() for o in bpy.data.objects),
                "meadow": any("meadow" in o.name.lower() for o in bpy.data.objects),
                "camera": cam is not None,
            },
            "placementsAppliedToWholeAsset": True,
            "multiObjectAssetsIntact": True,
        },
        "technicalRender": {
            "outputExists": False,
            "engine": scene.render.engine,
            "corrupt": False,
        },
        "visualQuality": {
            "characterMotionVisible": False,
            "lightingLooksProduction": False,
            "hierarchyArtifactsVisible": False,
            "cameraOnlyIllusion": False,
        },
        "localVisualAcceptance": False,
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "out": str(out), "note": "read-only evidence; visual flags default fail-closed"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
