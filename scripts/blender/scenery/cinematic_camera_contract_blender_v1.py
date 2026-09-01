"""Optional Blender validation of the six-shot camera lock. No assets. No render."""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from cinematic_camera_contract_v1 import CAMERA_C, evaluate_camera_contract, resolve_production_camera
from cinematic_shots import SHOTS, default_shot_cameras


def _install_six_cameras(bpy):
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 900
    names = []
    for spec in default_shot_cameras():
        start = spec["start"]
        end = spec["end"]
        bpy.ops.object.camera_add(location=start["location"])
        cam = bpy.context.object
        cam.name = spec["camera"]
        cam.data.lens = start["lens"]
        cam.data.dof.use_dof = False
        target = bpy.data.objects.new(spec["camera"] + "_LOOK", None)
        scene.collection.objects.link(target)
        target.location = start["look"]
        shot = next(item for item in SHOTS if item["id"] == spec["id"])
        cam.location = start["location"]
        cam.keyframe_insert(data_path="location", frame=shot["start"])
        cam.data.keyframe_insert(data_path="lens", frame=shot["start"])
        target.location = start["look"]
        target.keyframe_insert(data_path="location", frame=shot["start"])
        cam.location = end["location"]
        cam.keyframe_insert(data_path="location", frame=shot["end"])
        cam.data.lens = end["lens"]
        cam.data.keyframe_insert(data_path="lens", frame=shot["end"])
        target.location = end["look"]
        target.keyframe_insert(data_path="location", frame=shot["end"])
        if scene.timeline_markers.get(spec["id"]) is None:
            marker = scene.timeline_markers.new(spec["id"], frame=shot["start"])
            marker.camera = cam
        names.append(cam.name)
    return names


def run_blender_camera_contract() -> dict:
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)
    names = _install_six_cameras(bpy)
    bpy.ops.object.camera_add(location=(2.05, -21.6, 3.05))
    v3 = bpy.context.object
    v3.name = "TJ_V3_COMP_A"
    v3.data.lens = 32.0
    observed = []
    prev = None
    cuts = []
    for frame in range(1, 901):
        required = resolve_production_camera(frame)
        bpy.context.scene.frame_set(frame)
        bpy.context.scene.camera = bpy.data.objects[required]
        active = bpy.context.scene.camera.name
        if active != required:
            raise RuntimeError(f"frame {frame} camera {active} != {required}")
        if active == "TJ_V3_COMP_A":
            raise RuntimeError("V3 Comp A became scene.camera")
        if active != prev:
            cuts.append({"frame": frame, "camera": active})
            prev = active
        if frame in (1, 151, 210, 301, 451, 601, 751, 900):
            observed.append({"frame": frame, "camera": active})
    shot02 = bpy.data.objects["TJ_SHOT_02_CAM"]
    look = bpy.data.objects["TJ_SHOT_02_CAM_LOOK"]
    bpy.context.scene.frame_set(151)
    loc = tuple(round(v, 4) for v in shot02.location)
    look_loc = tuple(round(v, 4) for v in look.location)
    lens = float(shot02.data.lens)
    if loc != CAMERA_C["location"] or look_loc != CAMERA_C["look"] or lens != CAMERA_C["lens"]:
        raise RuntimeError(f"Camera C start pose drifted: {loc} {look_loc} {lens}")
    if [row["frame"] for row in cuts] != [1, 151, 301, 451, 601, 751]:
        raise RuntimeError(f"timeline cuts drifted: {cuts}")
    payload = {
        "schema": "TIVVLEJOY_V7_CAMERA_CONTRACT_BLENDER_V1",
        "ok": True,
        "cameras": names,
        "frame210": "TJ_SHOT_02_CAM",
        "cameraC": {"location": loc, "look": look_loc, "lens": lens},
        "cuts": cuts,
        "observed": observed,
        "v3CompAPresent": True,
        "v3CompAUsed": False,
    }
    print(json.dumps(payload))
    return payload


if __name__ == "__main__":
    contract = evaluate_camera_contract()
    if not contract["ok"]:
        raise SystemExit("camera contract failed before Blender")
    run_blender_camera_contract()
