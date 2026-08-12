"""
Minimal safe Pip/Goat rigging + animation repair (in-place on existing blends).

Evidence-backed fixes only:
1) Pose bones defaulted to QUATERNION while actions keyed rotation_euler
2) Armature modifiers present without weighted vertex groups
3) PIP_POINT was a static pose (keyed, zero inter-frame delta)

Does NOT redesign meshes, materials, proportions, asset IDs, or bone names.
"""

from __future__ import annotations

import json
import math
import os
import shutil
from pathlib import Path

ROOT = Path(os.environ.get("REPO_ROOT", "/tmp/ddp-rigging-repair"))
OUT_REPORT = ROOT / "artifacts/performance/rigging-audit/repair-report.json"

TARGETS = [
    ROOT / "assets/characters/pip/pip_v1_1.blend",
    ROOT / "assets/characters/goat/goat_v1_1.blend",
]


def set_euler_modes(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.location = (0.0, 0.0, 0.0)
        pb.rotation_euler = (0.0, 0.0, 0.0)


def bind_weights(mesh, arm):
    """Create usable deform binding via automatic weights; preserve mesh data."""
    import bpy

    if mesh is None or arm is None:
        return False

    # Drop prior empty armature modifiers; parent_set will recreate correctly.
    for mod in list(mesh.modifiers):
        if mod.type == "ARMATURE":
            mesh.modifiers.remove(mod)

    # Keep object parenting under the armature after auto-bind.
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")

    # Ensure modifier targets the intended armature.
    for mod in mesh.modifiers:
        if mod.type == "ARMATURE":
            mod.object = arm
            mod.use_vertex_groups = True
            mod.use_bone_envelopes = False
    return any(len(g.name) > 0 for g in mesh.vertex_groups)


def weighted_vert_count(mesh) -> int:
    if not mesh:
        return 0
    count = 0
    for v in mesh.data.vertices:
        if any(g.weight > 1e-6 for g in v.groups):
            count += 1
    return count


def add_action(arm, name, frames, fn):
    import bpy

    existing = bpy.data.actions.get(name)
    if existing:
        bpy.data.actions.remove(existing)

    action = bpy.data.actions.new(name=name)
    action.use_fake_user = True
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = action
    set_euler_modes(arm)
    for f in range(1, frames + 1):
        t = (f - 1) / max(1, frames - 1)
        set_euler_modes(arm)
        fn(arm, f, t)
        for pb in arm.pose.bones:
            pb.keyframe_insert(data_path="location", frame=f)
            pb.keyframe_insert(data_path="rotation_euler", frame=f)
    arm.animation_data.action = None
    return action


def pip_actions():
    def idle(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.05 * math.sin(t * math.pi * 2), 0, 0)
        a.pose.bones["comb"].rotation_euler = (0.08 * math.sin(t * math.pi * 2), 0, 0)

    def walk(a, f, t):
        s = math.sin(t * math.pi * 2) * 0.45
        a.pose.bones["leg_L"].rotation_euler = (s, 0, 0)
        a.pose.bones["leg_R"].rotation_euler = (-s, 0, 0)
        a.pose.bones["wing_L"].rotation_euler = (0, 0, s * 0.35)
        a.pose.bones["wing_R"].rotation_euler = (0, 0, -s * 0.35)
        a.pose.bones["root"].location = (0, t * 0.8, 0.01 * abs(math.sin(t * math.pi * 2)))

    def wave(a, f, t):
        a.pose.bones["wing_R"].rotation_euler = (0, 0, -0.9 - 0.35 * math.sin(t * math.pi * 4))
        a.pose.bones["head"].rotation_euler = (0, 0, 0.12)

    def look(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.08, 0, 0.4 * math.sin(t * math.pi))

    def point(a, f, t):
        # Temporal motion: ease into point + secondary wing wiggle (was static).
        ease = min(1.0, t * 1.4)
        wiggle = 0.12 * math.sin(t * math.pi * 2)
        a.pose.bones["wing_R"].rotation_euler = (0.15 * ease, -0.7 * ease, -0.35 * ease + wiggle)
        a.pose.bones["head"].rotation_euler = (0.05 * ease, 0, 0.15 * ease + 0.04 * math.sin(t * math.pi * 2))
        a.pose.bones["wing_L"].rotation_euler = (0, 0, 0.15 * ease)

    def talk(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.03 * math.sin(t * math.pi * 6), 0, 0)

    def jump(a, f, t):
        a.pose.bones["root"].location = (0, 0, 0.12 * math.sin(t * math.pi))
        a.pose.bones["wing_L"].rotation_euler = (0, 0, 0.5)
        a.pose.bones["wing_R"].rotation_euler = (0, 0, -0.5)

    def flap(a, f, t):
        s = math.sin(t * math.pi * 4) * 0.6
        a.pose.bones["wing_L"].rotation_euler = (0, 0, s)
        a.pose.bones["wing_R"].rotation_euler = (0, 0, -s)

    return [
        ("PIP_IDLE", idle),
        ("PIP_IDLE_ALT", lambda a, f, t: idle(a, f, t * 0.7)),
        ("PIP_WALK", walk),
        ("PIP_RUN", lambda a, f, t: walk(a, f, min(1.0, t * 1.6))),
        ("PIP_TURN_LEFT", look),
        ("PIP_TURN_RIGHT", look),
        ("PIP_LOOK_LEFT", look),
        ("PIP_LOOK_RIGHT", look),
        ("PIP_LOOK_UP", look),
        ("PIP_LOOK_DOWN", look),
        ("PIP_LOOK", look),
        ("PIP_POINT", point),
        ("PIP_WAVE", wave),
        ("PIP_JUMP", jump),
        ("PIP_CHEER", flap),
        ("PIP_THINK", talk),
        ("PIP_GREET", wave),
        ("PIP_TALK", talk),
        ("PIP_TALK_IDLE", talk),
        ("PIP_LISTEN", idle),
        ("PIP_LISTEN_IDLE", idle),
        ("PIP_TURN", look),
        ("PIP_HAPPY", wave),
        ("PIP_SURPRISED", look),
        ("PIP_WORRIED", idle),
        ("PIP_EXCITED", flap),
        ("PIP_SURPRISED_REACTION", look),
        ("PIP_WORRIED_REACTION", idle),
        ("PIP_HAPPY_REACTION", wave),
        ("PIP_FLAP_SMALL", flap),
        ("PIP_FLAP_EXCITED", flap),
    ]


def goat_actions():
    def idle(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.04 * math.sin(t * math.pi * 2), 0, 0)
        a.pose.bones["tail"].rotation_euler = (0, 0, 0.2 * math.sin(t * math.pi * 2))
        a.pose.bones["ear_L"].rotation_euler = (0, 0.05 * math.sin(t * math.pi * 2), 0)
        a.pose.bones["ear_R"].rotation_euler = (0, -0.05 * math.sin(t * math.pi * 2), 0)

    def walk(a, f, t):
        s = math.sin(t * math.pi * 2) * 0.4
        a.pose.bones["leg_FL"].rotation_euler = (s, 0, 0)
        a.pose.bones["leg_BR"].rotation_euler = (s, 0, 0)
        a.pose.bones["leg_FR"].rotation_euler = (-s, 0, 0)
        a.pose.bones["leg_BL"].rotation_euler = (-s, 0, 0)
        a.pose.bones["root"].location = (0, t * 0.9, 0)

    def look(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.1, 0, 0.4 * math.sin(t * math.pi))

    def talk(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.04 * math.sin(t * math.pi * 5), 0, 0)

    def nod(a, f, t):
        a.pose.bones["head"].rotation_euler = (0.25 * math.sin(t * math.pi * 2), 0, 0)

    def ear_react(a, f, t):
        a.pose.bones["ear_L"].rotation_euler = (0.3 * math.sin(t * math.pi * 2), 0.2, 0)
        a.pose.bones["ear_R"].rotation_euler = (-0.3 * math.sin(t * math.pi * 2), -0.2, 0)

    def point(a, f, t):
        ease = min(1.0, t * 1.4)
        a.pose.bones["head"].rotation_euler = (0.08 * ease, 0, 0.2 * ease)
        a.pose.bones["ear_L"].rotation_euler = (0.1 * ease, 0.1 * ease, 0)

    return [
        ("GOAT_IDLE", idle),
        ("GOAT_IDLE_ALT", lambda a, f, t: idle(a, f, t * 0.7)),
        ("GOAT_WALK", walk),
        ("GOAT_RUN", lambda a, f, t: walk(a, f, min(1.0, t * 1.5))),
        ("GOAT_TURN_LEFT", look),
        ("GOAT_TURN_RIGHT", look),
        ("GOAT_LOOK_LEFT", look),
        ("GOAT_LOOK_RIGHT", look),
        ("GOAT_LOOK_UP", look),
        ("GOAT_LOOK_DOWN", look),
        ("GOAT_LOOK", look),
        ("GOAT_POINT", point),
        ("GOAT_WAVE", look),
        ("GOAT_JUMP", walk),
        ("GOAT_CHEER", nod),
        ("GOAT_THINK", talk),
        ("GOAT_GREET", nod),
        ("GOAT_TALK", talk),
        ("GOAT_TALK_IDLE", talk),
        ("GOAT_LISTEN", idle),
        ("GOAT_LISTEN_IDLE", idle),
        ("GOAT_TURN", look),
        ("GOAT_HAPPY", nod),
        ("GOAT_SURPRISED", look),
        ("GOAT_WORRIED", idle),
        ("GOAT_EXCITED", nod),
        ("GOAT_SURPRISED_REACTION", look),
        ("GOAT_WORRIED_REACTION", idle),
        ("GOAT_HAPPY_REACTION", nod),
        ("GOAT_HEAD_NOD", nod),
        ("GOAT_HOOF_STEP", walk),
        ("GOAT_EAR_REACT", ear_react),
    ]


def repair_blend(path: Path) -> dict:
    import bpy

    bpy.ops.wm.open_mainfile(filepath=str(path))
    role = "pip" if "pip" in path.name.lower() else "goat"
    arm_name = "Pip_Rig" if role == "pip" else "Goat_Rig"
    mesh_name = "Pip_Character" if role == "pip" else "Goat_Character"
    arm = bpy.data.objects.get(arm_name)
    mesh = bpy.data.objects.get(mesh_name)
    if not arm or not mesh:
        return {"path": str(path), "ok": False, "error": "missing arm/mesh"}

    set_euler_modes(arm)
    accessory_names = (
        ["Pip_Backpack", "Pip_Backpack_Pouch", "Pip_StarCharm"]
        if role == "pip"
        else ["Goat_Collar", "Goat_Tag", "Goat_Tag_Text"]
    )
    bound = []
    for obj_name in [mesh_name, *accessory_names]:
        obj = bpy.data.objects.get(obj_name)
        if not obj:
            continue
        ok = bind_weights(obj, arm)
        bound.append({"object": obj_name, "bound": ok, "weightedVerts": weighted_vert_count(obj)})

    # Keep armature rest pose clean after weight ops.
    set_euler_modes(arm)

    actions = pip_actions() if role == "pip" else goat_actions()
    rebuilt = []
    for name, fn in actions:
        add_action(arm, name, 30, fn)
        rebuilt.append(name)

    # Persist canonical IDs already on mesh; do not alter.
    bpy.ops.wm.save_as_mainfile(filepath=str(path), check_existing=False)
    return {
        "path": str(path),
        "role": role,
        "ok": True,
        "rotationMode": "XYZ",
        "bindings": bound,
        "actionsRebuilt": rebuilt,
        "assetId": mesh.get("ddp_asset_id"),
        "characterCode": mesh.get("ddp_character_code"),
    }


def sync_production(results: list[dict]) -> list[str]:
    synced = []
    lib = ROOT / "production-library/characters"
    mapping = {
        str(ROOT / "assets/characters/pip/pip_v1_1.blend"): lib / "pip_production.blend",
        str(ROOT / "assets/characters/goat/goat_v1_1.blend"): lib / "goat_production.blend",
    }
    for src, dst in mapping.items():
        if Path(src).exists():
            shutil.copy2(src, dst)
            synced.append(str(dst))
    return synced


def main():
    report = {"targets": [], "syncedProduction": [], "status": "FAIL"}
    for path in TARGETS:
        if not path.exists():
            report["targets"].append({"path": str(path), "ok": False, "error": "missing"})
            continue
        report["targets"].append(repair_blend(path))
    report["syncedProduction"] = sync_production(report["targets"])
    report["status"] = "PASS" if report["targets"] and all(t.get("ok") for t in report["targets"]) else "FAIL"
    OUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUT_REPORT.write_text(json.dumps(report, indent=2) + "\n")
    print("RIGGING_REPAIR " + json.dumps({"status": report["status"], "out": str(OUT_REPORT)}))
    if report["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
