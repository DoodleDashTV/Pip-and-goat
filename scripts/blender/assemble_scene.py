"""Assemble and render a Doodle Dash production scene (real bpy implementation)."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

# Allow running both inside Blender (--python) and importing helpers.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import emit, parse_blender_args, require_asset  # noqa: E402


def set_eevee(scene, samples: int = 32) -> None:
    scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = max(1, samples)


def append_object(blend_path: str, names: list[str] | None = None):
    import bpy

    with bpy.data.libraries.load(blend_path, link=False) as (data_from, data_to):
        if names:
            data_to.objects = [n for n in data_from.objects if n in names]
            data_to.actions = list(data_from.actions)
            data_to.armatures = list(data_from.armatures)
        else:
            data_to.objects = list(data_from.objects)
            data_to.actions = list(data_from.actions)
            data_to.armatures = list(data_from.armatures)
    imported = []
    for obj in data_to.objects:
        if obj is not None:
            bpy.context.collection.objects.link(obj)
            imported.append(obj)
    return imported


def find_armature(objects):
    for obj in objects:
        if obj.type == "ARMATURE":
            return obj
    return None


def apply_action(arm, action_name: str | None, frame_start: int, frame_end: int) -> None:
    import bpy

    if not arm or not action_name:
        return
    action = bpy.data.actions.get(action_name)
    if not action:
        # fuzzy match
        for a in bpy.data.actions:
            if action_name.lower() in a.name.lower() or a.name.lower().endswith(action_name.lower()):
                action = a
                break
    if not action:
        return
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = action
    arm.animation_data.action_extrapolation = "HOLD"


def apply_viseme_cues(mesh_obj, cues: list[dict], fps: int) -> None:
    if not mesh_obj or not mesh_obj.data.shape_keys:
        return
    keys = mesh_obj.data.shape_keys.key_blocks
    alias = {
        "REST": "viseme_REST",
        "A": "viseme_A",
        "E": "viseme_E",
        "I": "viseme_I",
        "O": "viseme_O",
        "U": "viseme_U",
        "MBP": "viseme_MBP",
        "M_B_P": "viseme_MBP",
        "FV": "viseme_FV",
        "F_V": "viseme_FV",
        "L": "viseme_L",
        "WQ": "viseme_WQ",
        "TH": "viseme_L",
    }
    for cue in cues:
        vis = str(cue.get("viseme") or cue.get("code") or "REST")
        key_name = alias.get(vis, vis if vis.startswith("viseme_") else f"viseme_{vis}")
        if key_name not in keys:
            continue
        start_ms = int(cue.get("startMs") or cue.get("start_ms") or 0)
        end_ms = int(cue.get("endMs") or cue.get("end_ms") or start_ms + 80)
        weight = float(cue.get("weight") or 1.0)
        f0 = max(1, int(round(start_ms / 1000 * fps)))
        f1 = max(f0 + 1, int(round(end_ms / 1000 * fps)))
        kb = keys[key_name]
        kb.value = 0.0
        kb.keyframe_insert(data_path="value", frame=max(1, f0 - 1))
        kb.value = weight
        kb.keyframe_insert(data_path="value", frame=f0)
        kb.value = weight
        kb.keyframe_insert(data_path="value", frame=f1)
        kb.value = 0.0
        kb.keyframe_insert(data_path="value", frame=f1 + 1)


def configure_camera(scene, preset: str, width: int, height: int) -> None:
    import bpy

    cam = scene.camera
    if not cam:
        cam_data = bpy.data.cameras.new("ProdCam")
        cam = bpy.data.objects.new("ProdCam", cam_data)
        bpy.context.collection.objects.link(cam)
        scene.camera = cam
    preset = (preset or "WIDE").upper()
    if preset in ("CLOSE_UP", "REACTION"):
        cam.location = (0.4, -3.2, 1.5)
        cam.rotation_euler = (math.radians(85), 0, math.radians(8))
        cam.data.lens = 50
    elif preset in ("PUSH_IN", "FOLLOW"):
        cam.location = (0, -6.5, 2.0)
        cam.rotation_euler = (math.radians(78), 0, 0)
        cam.data.lens = 35
        # simple push keyframes
        cam.keyframe_insert(data_path="location", frame=1)
        cam.location = (0, -4.8, 1.7)
        cam.keyframe_insert(data_path="location", frame=scene.frame_end)
    elif preset in ("TWO_SHOT", "MEDIUM"):
        cam.location = (0.2, -5.5, 1.8)
        cam.rotation_euler = (math.radians(80), 0, 0)
        cam.data.lens = 35
    else:  # WIDE / ESTABLISHING
        cam.location = (0, -8.0, 2.4)
        cam.rotation_euler = (math.radians(75), 0, 0)
        cam.data.lens = 28
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False


def ensure_lights(scene) -> None:
    import bpy

    world = scene.world or bpy.data.worlds.new("MeadowWorld")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    bg = nodes.new(type="ShaderNodeBackground")
    bg.inputs[0].default_value = (0.45, 0.72, 0.95, 1.0)  # soft sky blue
    bg.inputs[1].default_value = 1.0
    out = nodes.new(type="ShaderNodeOutputWorld")
    links.new(bg.outputs[0], out.inputs[0])

    if any(o.type == "LIGHT" for o in bpy.data.objects):
        return
    bpy.ops.object.light_add(type="SUN", location=(4, -3, 10))
    bpy.context.object.data.energy = 3.0
    bpy.ops.object.light_add(type="AREA", location=(-3, -5, 4))
    bpy.context.object.data.energy = 50
    bpy.context.object.data.size = 6


def parse_resolution(value: str) -> tuple[int, int]:
    w, h = value.lower().split("x")
    return int(w), int(h)


def main() -> None:
    import bpy

    parser = argparse.ArgumentParser(description="Assemble and render a production shot.")
    parser.add_argument("--scene-id", required=True)
    parser.add_argument(
        "--resolution",
        choices=["270x480", "360x640", "540x960", "720x1280", "1080x1920"],
        default="540x960",
    )
    parser.add_argument("--fps", type=int, choices=[24, 30, 60], default=30)
    parser.add_argument("--engine", choices=["EEVEE", "CYCLES"], default="EEVEE")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--assets-json", default="[]")
    parser.add_argument("--start-frame", type=int, default=1)
    parser.add_argument("--end-frame", type=int, default=0)
    parser.add_argument("--samples", type=int, default=24)
    parser.add_argument("--camera-preset", default="WIDE")
    parser.add_argument("--shot-meta-json", default="{}")
    args = parse_blender_args(parser)

    assets = json.loads(args.assets_json)
    if not isinstance(assets, list):
        emit("INVALID_ARGUMENT", "assets-json must decode to a list.")
        raise SystemExit(2)

    missing = []
    for asset in assets:
        local_path = asset.get("localPath") if isinstance(asset, dict) else None
        role = asset.get("role", "asset") if isinstance(asset, dict) else "asset"
        try:
            require_asset(local_path, role)
        except SystemExit:
            missing.append({"role": role, "path": local_path})
    if missing:
        emit("MISSING_ASSET", "One or more scene assets are missing.", missing=missing)
        raise SystemExit(2)

    shot_meta = json.loads(args.shot_meta_json) if args.shot_meta_json else {}
    width, height = parse_resolution(args.resolution)
    fps = args.fps
    end_frame = args.end_frame if args.end_frame > 0 else int(shot_meta.get("endFrame") or 45)
    start_frame = args.start_frame

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = fps
    scene.frame_start = start_frame
    scene.frame_end = end_frame

    imported_by_role: dict[str, list] = {}
    for asset in assets:
        role = str(asset.get("id") or asset.get("role") or "other")
        local_path = asset["localPath"]
        objs = append_object(local_path)
        imported_by_role.setdefault(role, []).extend(objs)

    # Position characters if metadata provides offsets
    placements = shot_meta.get("placements") or {}
    for role, objs in imported_by_role.items():
        arm = find_armature(objs)
        target = arm or next((o for o in objs if o.type == "MESH"), None)
        if not target:
            continue
        place = placements.get(role) or {}
        if "location" in place:
            target.location = tuple(place["location"])
        if "rotation" in place:
            target.rotation_euler = tuple(place["rotation"])
        action = place.get("action") or (shot_meta.get("actions") or {}).get(role)
        apply_action(arm, action, start_frame, end_frame)
        mesh = next((o for o in objs if o.type == "MESH" and "Character" in o.name), None)
        if mesh is None:
            mesh = next((o for o in objs if o.type == "MESH"), None)
        cues = (shot_meta.get("lipSync") or {}).get(role) or []
        if mesh and cues:
            apply_viseme_cues(mesh, cues, fps)

    ensure_lights(scene)
    configure_camera(scene, args.camera_preset or shot_meta.get("cameraPreset") or "WIDE", width, height)
    if args.engine.upper() == "EEVEE":
        set_eevee(scene, args.samples)
    else:
        scene.render.engine = "CYCLES"

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(out_dir / "frame_")

    emit(
        "OK",
        "Scene assembled; beginning EEVEE frame render.",
        sceneId=args.scene_id,
        resolution=args.resolution,
        fps=fps,
        engine=scene.render.engine,
        frames=[start_frame, end_frame],
        roles=sorted(imported_by_role.keys()),
    )
    bpy.ops.render.render(animation=True)
    frame_count = len(list(out_dir.glob("frame_*.png")))
    meta = {
        "ok": True,
        "sceneId": args.scene_id,
        "resolution": args.resolution,
        "fps": fps,
        "engine": scene.render.engine,
        "frameCount": frame_count,
        "outputDir": str(out_dir),
    }
    (out_dir / "assemble_meta.json").write_text(json.dumps(meta, indent=2))
    emit("RENDER_OK", "Frames rendered.", **meta)


if __name__ == "__main__":
    main()
