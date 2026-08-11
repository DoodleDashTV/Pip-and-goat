"""
Real Pip + Goat validation animation (proves motion, not a still).
Renders a short EEVEE preview using v1 character assets.
"""
from __future__ import annotations

import json
import math
import os
import time
from pathlib import Path

ROOT = Path(os.environ.get("REPO_ROOT", "/agent"))
PIP = ROOT / "assets/characters/pip/pip_v1_1.blend"
GOAT = ROOT / "assets/characters/goat/goat_v1_1.blend"
MEADOW = ROOT / "production-library/environments/meadow_production.blend"
OUT = ROOT / "artifacts/performance/master-build/validation"
FRAMES = 60  # 2 seconds @ 30fps — real animation proof


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


def apply_action(arm, name):
    if not arm:
        return False
    action = None
    for a in __import__("bpy").data.actions:
        if a.name == name or a.name.endswith(name) or name in a.name:
            action = a
            break
    if not action:
        return False
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = action
    return True


def set_shape(mesh, key, value, frame):
    if not mesh or not mesh.data.shape_keys:
        return
    kb = mesh.data.shape_keys.key_blocks.get(key)
    if not kb:
        return
    kb.value = value
    kb.keyframe_insert(data_path="value", frame=frame)


def main():
    import bpy

    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    OUT.mkdir(parents=True, exist_ok=True)

    meadow = append_blend(MEADOW) if MEADOW.exists() else []
    pip_objs = append_blend(PIP)
    goat_objs = append_blend(GOAT)

    pip_arm = find_arm(pip_objs)
    goat_arm = find_arm(goat_objs)
    pip_mesh = find_mesh(pip_objs, "Pip_Character")
    goat_mesh = find_mesh(goat_objs, "Goat_Character")

    if pip_arm:
        pip_arm.location = (-0.55, 0, 0)
    if goat_arm:
        goat_arm.location = (0.7, 0, 0)

    # Animation sequence across 60 frames
    apply_action(pip_arm, "PIP_WAVE")
    apply_action(goat_arm, "GOAT_WALK")

    # Viseme / expression keyframes on both
    for f, (pv, gv, pe, ge) in [
        (1, ("viseme_REST", "viseme_REST", "expr_happy", "expr_listening")),
        (15, ("viseme_A", "viseme_REST", "expr_talking", "expr_listening")),
        (25, ("viseme_O", "viseme_A", "expr_excited", "expr_talking")),
        (35, ("viseme_MBP", "viseme_E", "expr_happy", "expr_happy")),
        (45, ("viseme_U", "viseme_O", "expr_surprised", "expr_surprised")),
        (60, ("viseme_REST", "viseme_REST", "expr_proud", "expr_proud")),
    ]:
        set_shape(pip_mesh, pv, 1.0, f)
        set_shape(goat_mesh, gv, 1.0, f)
        set_shape(pip_mesh, pe, 0.8, f)
        set_shape(goat_mesh, ge, 0.8, f)
        set_shape(pip_mesh, "eye_look_left" if f < 30 else "eye_look_right", 0.7, f)
        set_shape(goat_mesh, "eye_look_right" if f < 30 else "eye_look_left", 0.7, f)

    # Camera
    cam_data = bpy.data.cameras.new("ValCam")
    cam = bpy.data.objects.new("ValCam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0.2, -4.2, 1.1)
    cam.rotation_euler = (math.radians(82), 0, 0)
    bpy.context.scene.camera = cam
    if not any(o.type == "LIGHT" for o in bpy.data.objects):
        bpy.ops.object.light_add(type="SUN", location=(3, -2, 6))
        bpy.context.object.data.energy = 3.5

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 8
    scene.render.resolution_x = 540
    scene.render.resolution_y = 960
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = FRAMES
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(OUT / "frame_")

    checks = {
        "pipLoaded": bool(pip_arm and pip_mesh),
        "goatLoaded": bool(goat_arm and goat_mesh),
        "pipBackpack": any(o.name == "Pip_Backpack" for o in pip_objs),
        "goatCollar": any(o.name == "Goat_Collar" for o in goat_objs),
        "goatTag": any(o.name == "Goat_Tag" for o in goat_objs),
        "goatTagText": any(o.name == "Goat_Tag_Text" for o in goat_objs),
        "goatStamp": goat_mesh.get("ddp_tag_text") if goat_mesh else None,
        "pipAction": bool(pip_arm and pip_arm.animation_data and pip_arm.animation_data.action),
        "goatAction": bool(goat_arm and goat_arm.animation_data and goat_arm.animation_data.action),
        "pipShapeKeys": len(pip_mesh.data.shape_keys.key_blocks) if pip_mesh and pip_mesh.data.shape_keys else 0,
        "goatShapeKeys": len(goat_mesh.data.shape_keys.key_blocks) if goat_mesh and goat_mesh.data.shape_keys else 0,
    }

    t_render = time.time()
    bpy.ops.render.render(animation=True)
    render_ms = int((time.time() - t_render) * 1000)
    frames = sorted(OUT.glob("frame_*.png"))

    # Encode mp4
    import subprocess

    mp4 = OUT / "pip_goat_validation.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            "30",
            "-i",
            str(OUT / "frame_%04d.png"),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "20",
            str(mp4),
        ],
        check=False,
        capture_output=True,
    )

    ok = (
        checks["pipLoaded"]
        and checks["goatLoaded"]
        and checks["pipBackpack"]
        and checks["goatCollar"]
        and checks["goatTagText"]
        and checks["goatStamp"] in ("GOAT", "Goat")
        and checks["pipAction"]
        and checks["goatAction"]
        and len(frames) >= FRAMES
        and mp4.exists()
    )
    result = {
        "ok": ok,
        "status": "PASS" if ok else "FAIL",
        "frames": len(frames),
        "mp4": str(mp4) if mp4.exists() else None,
        "renderMs": render_ms,
        "totalMs": int((time.time() - t0) * 1000),
        "checks": checks,
        "resolution": "540x960",
        "fps": 30,
        "note": "Real animation validation — not a still frame",
    }
    (OUT / "validation-report.json").write_text(json.dumps(result, indent=2))
    print("DDP_VALIDATION:" + json.dumps(result))
    if not ok:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
