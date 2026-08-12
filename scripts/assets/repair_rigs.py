"""Repair DDP character rigs in place (idempotent).

The founding character blends shipped three defects that together made every
character render as a still pose:

  1. meshes carried an Armature modifier but zero vertex groups, so the armature
     could not deform them at all;
  2. every pose bone was left in QUATERNION mode while all 30+ authored actions
     write ``rotation_euler``, so the evaluator ignored the animation;
  3. PIP_POINT keyframed the same pose on all 30 frames (a dead action).

This repairs the existing blends rather than regenerating them, so all authored
actions, accessories and shape keys are preserved.

Run:
  blender -b -noaudio --python scripts/assets/repair_rigs.py -- \
      --blend production-library/characters/pip_production.blend --role pip
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "blender"))
from ddp_rig import (  # noqa: E402
    author_action,
    bind_rigid,
    bind_skin,
    count_unweighted_vertices,
    fcurve_varies,
    rotation_mode_conflicts,
    sample_local_motion,
)

# Headline actions are authored across the whole acceptance shot so motion is
# spread over all 90 frames instead of finishing in the first second, and so the
# gate's sampled frames can never all land on the same phase of a short loop.
ACTION_FRAMES = 90
SAMPLE_FRAMES = [1, 30, 60, 90]

# Which mesh is skin, and which accessories ride rigidly on which bone.
RIG_PLAN = {
    "pip": {
        "armature": "Pip_Rig",
        "skin": ["Pip_Character"],
        "rigid": {
            "Pip_Backpack": "backpack",
            "Pip_Backpack_Pouch": "backpack",
            "Pip_StarCharm": "backpack",
        },
        "headline": "PIP_POINT",
    },
    "goat": {
        "armature": "Goat_Rig",
        "skin": ["Goat_Character"],
        "rigid": {
            "Goat_Collar": "collar",
            "Goat_Tag": "collar",
            "Goat_Tag_Text": "collar",
        },
        "headline": "GOAT_HEAD_NOD",
    },
}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Repair a DDP character rig in place.")
    parser.add_argument("--blend", required=True)
    parser.add_argument("--role", required=True, choices=sorted(RIG_PLAN))
    parser.add_argument("--report", default="")
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    return parser.parse_args(argv)


def _smoothstep(edge0: float, edge1: float, x: float) -> float:
    if edge1 <= edge0:
        return 0.0
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def pip_point(p, frame: int, t: float) -> None:
    """Pip lifts a wing toward the map, holds the point, then turns to the goat.

    Three distinct beats plus a monotonic head-yaw drift, so any two sampled
    frames differ and the motion covers the whole shot rather than the first
    second.
    """
    raise_in = _smoothstep(0.02, 0.30, t)
    release = _smoothstep(0.70, 1.0, t)
    point = raise_in * (1.0 - release)
    sway = math.sin(math.pi * 2 * 1.5 * t)
    bob = math.sin(math.pi * 2 * 2.0 * t)
    p.rot("wing_R", 0.25 * point, -1.20 * point, -0.55 * point)
    p.rot("wing_L", 0.0, 0.22 * point, 0.16 * point + 0.05 * sway)
    p.rot("head", 0.28 * point + 0.04 * sway, 0.0, 0.26 * point - 0.38 * release + 0.06 * t)
    p.rot("neck", 0.12 * point, 0.0, 0.09 * point - 0.12 * release)
    p.rot("chest", 0.13 * point, 0.0, 0.05 * t)
    p.rot("comb", -0.16 * point + 0.05 * sway, 0.0, 0.0)
    p.loc("root", 0.0, 0.0, 0.03 * bob)


def goat_head_nod(p, frame: int, t: float) -> None:
    """Two clear nods with counter-moving ears, tail sway and a slow head turn.

    The monotonic yaw drift guarantees the nod phase cannot alias with the
    sampled gate frames.
    """
    nod = math.sin(math.pi * 2 * 2.0 * t)
    sway = math.sin(math.pi * 2 * 1.5 * t + math.pi / 3)
    p.rot("head", 0.38 * nod, 0.0, 0.18 * t + 0.05 * sway)
    p.rot("neck", 0.18 * nod, 0.0, 0.08 * t)
    p.rot("ear_L", -0.30 * nod, 0.16 * sway, 0.0)
    p.rot("ear_R", -0.30 * nod, -0.16 * sway, 0.0)
    p.rot("tail", 0.0, 0.0, 0.42 * sway)
    p.rot("chest", 0.06 * nod, 0.0, 0.04 * t)
    p.loc("root", 0.0, 0.0, 0.022 * abs(nod))


REAUTHOR = {"PIP_POINT": pip_point, "GOAT_HEAD_NOD": goat_head_nod}


def main() -> int:
    import bpy

    args = parse_args(sys.argv)
    plan = RIG_PLAN[args.role]
    bpy.ops.wm.open_mainfile(filepath=args.blend)

    arm = bpy.data.objects.get(plan["armature"])
    if arm is None or arm.type != "ARMATURE":
        print(f"DDP_RIG_REPAIR_FAIL: armature {plan['armature']} missing")
        return 2

    steps: dict[str, object] = {}

    # 1. One supported rotation mode. Every authored action writes euler, so make
    #    euler the explicit, compatible mode instead of silently ignored input.
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
    steps["rotationMode"] = "XYZ"

    # 2. Real skinning for deforming meshes, declared rigidity for accessories.
    bindings = []
    for name in plan["skin"]:
        obj = bpy.data.objects.get(name)
        if obj is None:
            print(f"DDP_RIG_REPAIR_FAIL: skin mesh {name} missing")
            return 2
        bindings.append(bind_skin(obj, arm))
    for name, bone in plan["rigid"].items():
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        bindings.append(bind_rigid(obj, arm, bone))
    steps["bindings"] = bindings

    # 3. Replace dead / threadbare headline actions with genuine motion.
    reauthored = []
    for action_name, mutate in REAUTHOR.items():
        if not action_name.startswith(args.role.upper()):
            continue
        existing = bpy.data.actions.get(action_name)
        if existing is not None:
            bpy.data.actions.remove(existing)
        reauthored.append(author_action(arm, action_name, ACTION_FRAMES, mutate))
    steps["reauthored"] = reauthored

    # Validate before saving: nothing dead, nothing ignored, geometry really moves.
    failures: list[str] = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if not any(m.type == "ARMATURE" for m in obj.modifiers):
            continue
        if not obj.vertex_groups:
            failures.append(f"{obj.name}: still has no vertex groups")
        elif count_unweighted_vertices(obj):
            failures.append(f"{obj.name}: {count_unweighted_vertices(obj)} unweighted vertices")

    for action in bpy.data.actions:
        fcurves = list(action.fcurves)
        if fcurves and not any(fcurve_varies(fc) for fc in fcurves):
            failures.append(f"{action.name}: dead action (no channel varies)")
        conflicts = rotation_mode_conflicts(arm, action)
        if conflicts:
            failures.append(f"{action.name}: {len(conflicts)} channels animate an ignored rotation mode")

    headline = bpy.data.actions.get(plan["headline"])
    motion = None
    if headline is None:
        failures.append(f"headline action {plan['headline']} missing")
    else:
        if not arm.animation_data:
            arm.animation_data_create()
        arm.animation_data.action = headline
        arm.animation_data.action_extrapolation = "HOLD"
        scene = bpy.context.scene
        scene.frame_start = 1
        scene.frame_end = ACTION_FRAMES
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        motion = sample_local_motion(arm, meshes, SAMPLE_FRAMES)
        if motion["maxBoneDelta"] <= 1e-4:
            failures.append(f"{plan['headline']}: evaluated pose still does not change")
        if motion["maxVertexDelta"] <= 1e-3:
            failures.append(f"{plan['headline']}: evaluated geometry still static (skinning not working)")
        if motion["minConsecutiveVertexDelta"] <= 1e-3:
            failures.append(
                f"{plan['headline']}: geometry is identical between two sampled frames "
                f"({motion['pairwiseVertexDeltas']}) — motion does not cover the shot"
            )
    steps["motion"] = motion

    report = {
        "role": args.role,
        "blend": args.blend,
        "steps": steps,
        "failures": failures,
        "ok": not failures,
        "status": "PASS" if not failures else "FAIL",
    }
    if args.report:
        out = Path(args.report)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2))

    if failures:
        print("DDP_RIG_REPAIR:" + json.dumps(report))
        return 2

    bpy.ops.wm.save_as_mainfile(filepath=args.blend, compress=False)
    print("DDP_RIG_REPAIR:" + json.dumps({"role": args.role, "status": "PASS", "motion": motion}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
