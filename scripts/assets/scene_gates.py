"""Fail-closed local quality gates for the DDP acceptance scene.

Builds the real production shot through ``assemble_scene.build_scene`` (the same
code path the GPU renderer uses), then evaluates it and emits the gate report
that must pass before any FINAL_1080P cloud acceptance render is allowed:

  RIG_BINDING_VALID        every skinned mesh has usable weights on deform bones
  PIP_MOTION_VALID         Pip's evaluated geometry moves across the shot
  GOAT_MOTION_VALID        Goat's evaluated geometry moves across the shot
  ANIMATION_CHANNELS_VALID no action animates an ignored rotation mode
  LIGHTING_STATE_VALID     manifest lightingState selected the intended rig
  NO_DUPLICATE_LIGHTS      exactly the authoritative key/fill/rim rig is active
  ASSET_HIERARCHY_VALID    multi-object assets stayed intact (MapMark attached)

Character motion is measured in each character's own local space, so neither
camera movement nor object placement can satisfy a motion gate.

Run:
  blender -b -noaudio --python scripts/assets/scene_gates.py -- \
      --out artifacts/local-acceptance/scene_gates.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "blender"))
from ddp_rig import count_unweighted_vertices, rotation_mode_conflicts, sample_local_motion  # noqa: E402
import assemble_scene as A  # noqa: E402

SAMPLE_FRAMES = [1, 30, 60, 90]
# Local-space displacement (metres) a character must show to count as animated.
MIN_TOTAL_MOTION = 0.01
# ...and between every consecutive sampled pair, so motion covers the whole shot
# instead of finishing in the first second.
MIN_INTERVAL_MOTION = 0.002
EXPECTED_LIGHT_COUNT = 3

LIB = REPO_ROOT / "production-library"
ASSETS = [
    {"id": "meadow", "role": "meadow", "localPath": str(LIB / "environments/meadow_production.blend")},
    {"id": "map", "role": "map", "localPath": str(LIB / "props/adventure_map.blend")},
    {"id": "pip", "role": "pip", "localPath": str(LIB / "characters/pip_production.blend")},
    {"id": "goat", "role": "goat", "localPath": str(LIB / "characters/goat_production.blend")},
]

SHOT_META = {
    "title": "Meadow Map Mystery — local acceptance",
    "cameraPreset": "PUSH_IN",
    "lightingState": "DAY_KEY",
    "placements": {
        "pip": {"location": [-0.72, -1.5, 0.0], "rotation": [0.0, 0.0, 0.34], "action": "PIP_POINT"},
        "goat": {"location": [0.72, -1.2, 0.0], "rotation": [0.0, 0.0, -0.42], "action": "GOAT_HEAD_NOD"},
    },
}


#: Faults that can be injected to prove each gate actually fails when the defect
#: it guards against is present. ``expect`` names the gate that must flip false.
FAULTS = {
    "camera-only": "PIP_MOTION_VALID",
    "keep-imported-lights": "NO_DUPLICATE_LIGHTS",
    "map-detach": "ASSET_HIERARCHY_VALID",
    "quaternion-bones": "ANIMATION_CHANNELS_VALID",
    "unbind-skin": "RIG_BINDING_VALID",
}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate DDP local quality gates.")
    parser.add_argument("--out", required=True)
    parser.add_argument("--resolution", default="1080x1920")
    parser.add_argument("--frames", type=int, default=90)
    parser.add_argument("--lighting-state", default=SHOT_META["lightingState"])
    parser.add_argument(
        "--fault",
        default="",
        choices=[""] + sorted(FAULTS),
        help="inject a known defect to prove the matching gate fails closed",
    )
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    return parser.parse_args(argv)


def inject_fault(fault: str, by_role: dict) -> None:
    """Reproduce a specific historical defect so its gate can be shown to catch it."""
    import bpy

    if fault == "camera-only":
        # Strip character animation but leave the camera push-in intact. The
        # motion gates must still fail: a moving camera is not character motion.
        for role in ("pip", "goat"):
            arm = A.find_armature(by_role.get(role, []))
            if arm is not None and arm.animation_data:
                arm.animation_data.action = None
    elif fault == "map-detach":
        # The original bug: a placement moved only the first imported mesh.
        paper = bpy.data.objects.get("AdventureMap")
        if paper is not None:
            paper.parent = None
            paper.location = (0.0, -0.8, 0.02)
    elif fault == "quaternion-bones":
        for role in ("pip", "goat"):
            arm = A.find_armature(by_role.get(role, []))
            if arm is None:
                continue
            for pb in arm.pose.bones:
                pb.rotation_mode = "QUATERNION"
    elif fault == "unbind-skin":
        for name in ("Pip_Character", "Goat_Character"):
            obj = bpy.data.objects.get(name)
            if obj is None:
                continue
            for vg in list(obj.vertex_groups):
                obj.vertex_groups.remove(vg)


def character_motion(role: str, objects) -> dict:
    arm = A.find_armature(objects)
    meshes = [o for o in objects if o.type == "MESH"]
    if arm is None or not meshes:
        return {"role": role, "error": "armature or mesh missing", "maxVertexDelta": 0.0}
    motion = sample_local_motion(arm, meshes, SAMPLE_FRAMES)
    motion["role"] = role
    motion["armature"] = arm.name
    motion["action"] = arm.animation_data.action.name if arm.animation_data and arm.animation_data.action else None
    return motion


def main() -> int:
    import bpy

    args = parse_args(sys.argv)
    width, height = A.parse_resolution(args.resolution)
    shot_meta = dict(SHOT_META)
    shot_meta["lightingState"] = args.lighting_state

    missing = [a["localPath"] for a in ASSETS if not Path(a["localPath"]).exists()]
    if missing:
        print("DDP_SCENE_GATES:" + json.dumps({"ok": False, "error": "missing assets", "missing": missing}))
        return 2

    if args.fault == "keep-imported-lights":
        shot_meta["keepImportedLights"] = True

    built = A.build_scene(
        assets=ASSETS,
        shot_meta=shot_meta,
        width=width,
        height=height,
        fps=30,
        start_frame=1,
        end_frame=args.frames,
        camera_preset=shot_meta["cameraPreset"],
        engine="EEVEE",
        samples=24,
    )

    by_role = built["importedByRole"]
    if args.fault:
        inject_fault(args.fault, by_role)
    motions = {role: character_motion(role, by_role.get(role, [])) for role in ("pip", "goat")}

    # RIG_BINDING_VALID
    binding_rows = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not any(m.type == "ARMATURE" for m in obj.modifiers):
            continue
        unweighted = count_unweighted_vertices(obj)
        binding_rows.append(
            {
                "mesh": obj.name,
                "vertexGroups": len(obj.vertex_groups),
                "unweighted": unweighted,
                "ok": len(obj.vertex_groups) > 0 and unweighted == 0,
            }
        )
    rig_binding_valid = bool(binding_rows) and all(r["ok"] for r in binding_rows)

    # ANIMATION_CHANNELS_VALID
    conflicts = []
    for role in ("pip", "goat"):
        arm = A.find_armature(by_role.get(role, []))
        if arm is None:
            continue
        for action in bpy.data.actions:
            if not action.name.upper().startswith(role.upper()):
                continue
            for conflict in rotation_mode_conflicts(arm, action):
                conflicts.append({"action": action.name, **conflict})
    animation_channels_valid = not conflicts

    # LIGHTING_STATE_VALID + NO_DUPLICATE_LIGHTS
    lighting = built["lighting"]
    lighting_state_valid = lighting["lightingState"] == A.resolve_lighting_state(args.lighting_state)
    active_lights = [o.name for o in bpy.data.objects if o.type == "LIGHT"]
    no_duplicate_lights = len(active_lights) == EXPECTED_LIGHT_COUNT and len(set(active_lights)) == len(active_lights)

    # ASSET_HIERARCHY_VALID — the map's two pieces must still travel together.
    bpy.context.view_layer.update()
    map_objs = [o for o in by_role.get("map", []) if o.name in bpy.data.objects]
    map_names = sorted(o.name for o in map_objs)
    map_root = built["placementRoots"].get("map", {})
    paper = bpy.data.objects.get("AdventureMap")
    mark = bpy.data.objects.get("MapMark")

    def top_ancestor(obj):
        while obj.parent is not None:
            obj = obj.parent
        return obj.name

    shared_root = None
    separation = None
    map_attached = False
    if paper is not None and mark is not None:
        shared_root = top_ancestor(paper) == top_ancestor(mark)
        separation = round((paper.matrix_world.translation - mark.matrix_world.translation).length, 6)
        # The authored offset between the paper and its marker is ~0.117m. Both
        # the structural relationship and the geometric offset must hold: sharing
        # a root is what makes a placement move the whole prop, and the distance
        # confirms no placement pulled one piece away.
        map_attached = bool(shared_root) and separation < 0.3
    hierarchy_valid = bool(paper and mark and map_attached)

    pip_motion_ok = (
        motions["pip"].get("maxVertexDelta", 0.0) >= MIN_TOTAL_MOTION
        and motions["pip"].get("minConsecutiveVertexDelta", 0.0) >= MIN_INTERVAL_MOTION
    )
    goat_motion_ok = (
        motions["goat"].get("maxVertexDelta", 0.0) >= MIN_TOTAL_MOTION
        and motions["goat"].get("minConsecutiveVertexDelta", 0.0) >= MIN_INTERVAL_MOTION
    )

    gates = {
        "RIG_BINDING_VALID": rig_binding_valid,
        "PIP_MOTION_VALID": pip_motion_ok,
        "GOAT_MOTION_VALID": goat_motion_ok,
        "ANIMATION_CHANNELS_VALID": animation_channels_valid,
        "LIGHTING_STATE_VALID": lighting_state_valid,
        "NO_DUPLICATE_LIGHTS": no_duplicate_lights,
        "ASSET_HIERARCHY_VALID": hierarchy_valid,
    }
    report = {
        "ok": all(gates.values()),
        "status": "PASS" if all(gates.values()) else "FAIL",
        "gates": gates,
        "injectedFault": args.fault or None,
        "faultExpectedGate": FAULTS.get(args.fault) if args.fault else None,
        "resolution": args.resolution,
        "frames": args.frames,
        "sampleFrames": SAMPLE_FRAMES,
        "thresholds": {
            "minTotalMotion": MIN_TOTAL_MOTION,
            "minIntervalMotion": MIN_INTERVAL_MOTION,
            "expectedLightCount": EXPECTED_LIGHT_COUNT,
        },
        "motion": motions,
        "binding": binding_rows,
        "rotationConflicts": conflicts,
        "lighting": lighting,
        "activeLights": sorted(active_lights),
        "strippedFromAssets": built["stripped"],
        "placementRoots": built["placementRoots"],
        "appliedActions": built["appliedActions"],
        "map": {
            "objects": map_names,
            "root": map_root,
            "paperToMarkDistance": separation,
            "sharedRoot": shared_root,
        },
        # Hashes let the cloud preflight refuse a gate report produced from
        # different assets than the ones it is about to upload and render.
        "assetSha256": {
            asset["role"]: hashlib.sha256(Path(asset["localPath"]).read_bytes()).hexdigest() for asset in ASSETS
        },
        "blenderVersion": bpy.app.version_string,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))
    print(
        "DDP_SCENE_GATES:"
        + json.dumps({"status": report["status"], "gates": gates, "fault": args.fault or None})
    )
    if args.fault:
        # Under fault injection, success means the guarded gate DID fail.
        expected = FAULTS[args.fault]
        return 0 if gates.get(expected) is False else 3
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
