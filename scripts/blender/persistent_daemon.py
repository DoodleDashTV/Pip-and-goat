"""
Persistent Blender render daemon for Doodle Dash Production.

Keeps one Blender process alive across jobs to avoid repeated startups.
Protocol: newline-delimited JSON on stdin, responses on stdout prefixed DDP_DAEMON:

Commands:
  {"cmd":"ping"}
  {"cmd":"preload","assets":[{"id":"pip","path":"..."}]}
  {"cmd":"render","job":{...}}  # same shape as assemble_scene args
  {"cmd":"reset"}
  {"cmd":"quit"}

Timings are returned for: blender_startup (0 after first), asset_loading,
scene_assembly, animation_application, facial_visemes, frame_render, encode.
"""

from __future__ import annotations

import json
import math
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

STARTED_AT = time.time()
BLENDER_STARTUPS = 1  # this process
PRELOADED: dict[str, str] = {}


def emit(obj: dict) -> None:
    sys.stdout.write("DDP_DAEMON:" + json.dumps(obj) + "\n")
    sys.stdout.flush()


def reset_scene() -> None:
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)


def set_eevee(scene, samples: int = 20) -> None:
    scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = max(1, samples)


def append_blend(blend_path: str):
    import bpy

    with bpy.data.libraries.load(blend_path, link=False) as (data_from, data_to):
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


def apply_action(arm, action_name, frame_start, frame_end):
    import bpy

    if not arm or not action_name:
        return
    action = bpy.data.actions.get(action_name)
    if not action:
        for a in bpy.data.actions:
            if action_name.lower() in a.name.lower():
                action = a
                break
    if not action:
        return
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = action


def apply_viseme_cues(mesh_obj, cues, fps):
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
        start_ms = int(cue.get("startMs") or 0)
        end_ms = int(cue.get("endMs") or start_ms + 80)
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


def ensure_sky(scene):
    import bpy

    world = scene.world or bpy.data.worlds.new("MeadowWorld")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    bg = nodes.new(type="ShaderNodeBackground")
    bg.inputs[0].default_value = (0.45, 0.72, 0.95, 1.0)
    bg.inputs[1].default_value = 1.0
    out = nodes.new(type="ShaderNodeOutputWorld")
    links.new(bg.outputs[0], out.inputs[0])
    if not any(o.type == "LIGHT" for o in bpy.data.objects):
        bpy.ops.object.light_add(type="SUN", location=(4, -3, 10))
        bpy.context.object.data.energy = 3.0


def configure_camera(scene, preset, width, height):
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
    elif preset in ("TWO_SHOT", "MEDIUM"):
        cam.location = (0.2, -5.5, 1.8)
        cam.rotation_euler = (math.radians(80), 0, 0)
        cam.data.lens = 35
    else:
        cam.location = (0, -8.0, 2.4)
        cam.rotation_euler = (math.radians(75), 0, 0)
        cam.data.lens = 28
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100


def handle_render(job: dict) -> dict:
    import bpy

    timings = {}
    t0 = time.time()
    reset_scene()
    timings["scene_reset_ms"] = int((time.time() - t0) * 1000)

    assets = job.get("assets") or []
    meta = job.get("metadata") or {}
    shot_meta = meta.get("shotMeta") or meta
    resolution = job.get("resolution") or "540x960"
    w, h = [int(x) for x in resolution.lower().split("x")]
    fps = int(job.get("fps") or 30)
    samples = int(meta.get("samples") or 20)
    start_frame = int(meta.get("startFrame") or 1)
    end_frame = int(meta.get("endFrame") or 30)
    output_dir = Path(job["outputDir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    scene = bpy.context.scene
    scene.render.fps = fps
    scene.frame_start = start_frame
    scene.frame_end = end_frame

    t1 = time.time()
    imported_by_role = {}
    role_load_ms = {}
    for asset in assets:
        role = str(asset.get("id") or asset.get("role") or "other")
        local_path = asset.get("localPath") or asset.get("path")
        if not local_path or not Path(local_path).exists():
            raise FileNotFoundError(f"Missing asset {role}: {local_path}")
        rt = time.time()
        objs = append_blend(local_path)
        role_load_ms[role] = int((time.time() - rt) * 1000)
        imported_by_role.setdefault(role, []).extend(objs)
        PRELOADED[role] = local_path
    timings["asset_loading_ms"] = int((time.time() - t1) * 1000)
    timings["pip_load_ms"] = role_load_ms.get("pip")
    timings["goat_load_ms"] = role_load_ms.get("goat")
    timings["environment_load_ms"] = role_load_ms.get("meadow") or role_load_ms.get("environment")
    timings["prop_load_ms"] = role_load_ms.get("map") or role_load_ms.get("prop")
    timings["role_load_ms"] = role_load_ms

    t2 = time.time()
    placements = shot_meta.get("placements") or {}
    for role, objs in imported_by_role.items():
        arm = find_armature(objs)
        target = arm or next((o for o in objs if o.type == "MESH"), None)
        if not target:
            continue
        place = placements.get(role) or {}
        if "location" in place:
            target.location = tuple(place["location"])
        action = place.get("action") or (shot_meta.get("actions") or {}).get(role)
        apply_action(arm, action, start_frame, end_frame)
        mesh = next((o for o in objs if o.type == "MESH" and "Character" in o.name), None)
        if mesh is None:
            mesh = next((o for o in objs if o.type == "MESH"), None)
        cues = (shot_meta.get("lipSync") or {}).get(role) or []
        if mesh and cues:
            apply_viseme_cues(mesh, cues, fps)
    timings["animation_application_ms"] = int((time.time() - t2) * 1000)
    timings["facial_visemes_ms"] = timings["animation_application_ms"]  # combined for now

    t3 = time.time()
    ensure_sky(scene)
    configure_camera(scene, meta.get("cameraPreset") or shot_meta.get("cameraPreset") or "WIDE", w, h)
    set_eevee(scene, samples)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(output_dir / "frame_")
    timings["scene_assembly_ms"] = int((time.time() - t3) * 1000)

    t4 = time.time()
    bpy.ops.render.render(animation=True)
    timings["frame_render_ms"] = int((time.time() - t4) * 1000)
    frames = sorted(output_dir.glob("frame_*.png"))
    frame_count = len(frames)
    seconds_per_frame = (timings["frame_render_ms"] / 1000 / frame_count) if frame_count else None

    # Encode shot.mp4 via ffmpeg if available (skipped for AUDIT_FAST micro renders)
    t5 = time.time()
    mp4 = output_dir / "shot.mp4"
    skip_encode = bool(meta.get("skipEncode") or meta.get("auditMicro"))
    if frames and not skip_encode:
        import subprocess

        sample = frames[0].name
        padded = len(sample) >= 14  # frame_0001.png
        if padded:
            pattern = str(output_dir / "frame_%04d.png")
            argv = [
                "ffmpeg",
                "-y",
                "-framerate",
                str(fps),
                "-i",
                pattern,
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-crf",
                "18",
                str(mp4),
            ]
        else:
            argv = [
                "ffmpeg",
                "-y",
                "-framerate",
                str(fps),
                "-pattern_type",
                "glob",
                "-i",
                str(output_dir / "frame_*.png"),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-crf",
                "18",
                str(mp4),
            ]
        subprocess.run(argv, check=False, capture_output=True)
    timings["ffmpeg_encoding_ms"] = 0 if skip_encode else int((time.time() - t5) * 1000)

    meta_out = {
        "ok": True,
        "frameCount": frame_count,
        "resolution": resolution,
        "fps": fps,
        "samples": samples,
        "secondsPerFrame": seconds_per_frame,
        "timings": timings,
        "blenderStartupsThisProcess": BLENDER_STARTUPS,
        "outputDir": str(output_dir),
        "mp4": str(mp4) if mp4.exists() else None,
        "device": "CPU",
    }
    (output_dir / "assemble_meta.json").write_text(json.dumps(meta_out, indent=2))
    return meta_out


def handle_validate_assets(msg: dict) -> dict:
    """Load Pip/Goat/env once and verify mesh/rig/collar identity — no animation render."""
    import bpy

    timings = {}
    t0 = time.time()
    reset_scene()
    timings["scene_reset_ms"] = int((time.time() - t0) * 1000)

    assets = msg.get("assets") or []
    checks = []
    load_ms = {}
    imported = {}
    for asset in assets:
        role = str(asset.get("id") or asset.get("role") or "other")
        local_path = asset.get("localPath") or asset.get("path")
        t1 = time.time()
        if not local_path or not Path(local_path).exists():
            checks.append({"role": role, "ok": False, "error": f"missing {local_path}"})
            continue
        objs = append_blend(local_path)
        imported[role] = objs
        load_ms[role] = int((time.time() - t1) * 1000)
        names = {o.name for o in objs}
        arm = find_armature(objs)
        mesh = next((o for o in objs if o.type == "MESH" and "Character" in o.name), None)
        if mesh is None:
            mesh = next((o for o in objs if o.type == "MESH"), None)
        check = {
            "role": role,
            "ok": True,
            "objectCount": len(objs),
            "hasArmature": bool(arm),
            "armature": arm.name if arm else None,
            "mesh": mesh.name if mesh else None,
            "loadMs": load_ms[role],
            "names": sorted(names)[:40],
        }
        if role == "goat":
            tag_text = "Goat_Tag_Text" in names
            collar = "Goat_Collar" in names
            tag = "Goat_Tag" in names
            stamped = None
            if mesh and "ddp_tag_text" in mesh.keys():
                stamped = mesh["ddp_tag_text"]
            check["collar"] = collar
            check["tag"] = tag
            check["tagTextObject"] = tag_text
            check["stampedTagText"] = stamped
            check["ok"] = bool(arm and mesh and collar and tag and tag_text and stamped == "Goat")
            if not check["ok"]:
                check["error"] = "Goat character lock / collar name-tag failed"
        if role == "pip":
            check["ok"] = bool(arm and mesh and ("Pip_Character" in names or mesh is not None))
            if not check["ok"]:
                check["error"] = "Pip character lock failed"
        checks.append(check)
        PRELOADED[role] = local_path

    timings["asset_loading_ms"] = sum(load_ms.values())
    timings["pip_load_ms"] = load_ms.get("pip")
    timings["goat_load_ms"] = load_ms.get("goat")
    ok = all(c.get("ok") for c in checks) and len(checks) > 0
    return {
        "ok": ok,
        "checks": checks,
        "timings": timings,
        "blenderStartupsThisProcess": BLENDER_STARTUPS,
        "uptimeMs": int((time.time() - STARTED_AT) * 1000),
        "loadedRoles": list(imported.keys()),
    }


def handle_micro_render(msg: dict) -> dict:
    """1–3 frame EEVEE smoke at tiny resolution. No final encoding."""
    import bpy

    job = dict(msg.get("job") or msg)
    meta = dict(job.get("metadata") or {})
    meta["samples"] = int(meta.get("samples") or 2)
    meta["startFrame"] = 1
    meta["endFrame"] = max(1, min(int(meta.get("endFrame") or 1), 3))
    meta["skipEncode"] = True
    meta["auditMicro"] = True
    job["metadata"] = meta
    job["resolution"] = job.get("resolution") or "270x480"
    job["fps"] = int(job.get("fps") or 30)
    result = handle_render(job)
    result["auditMicro"] = True
    result["frameCountCap"] = meta["endFrame"]
    result["samples"] = meta["samples"]
    return result


def main() -> None:
    emit(
        {
            "status": "ready",
            "pid": os.getpid(),
            "blenderStartups": BLENDER_STARTUPS,
            "uptimeMs": int((time.time() - STARTED_AT) * 1000),
        }
    )
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError as e:
            emit({"status": "error", "error": f"invalid json: {e}"})
            continue
        cmd = msg.get("cmd")
        try:
            if cmd == "ping":
                emit(
                    {
                        "status": "ok",
                        "cmd": "ping",
                        "blenderStartups": BLENDER_STARTUPS,
                        "uptimeMs": int((time.time() - STARTED_AT) * 1000),
                    }
                )
            elif cmd == "preload":
                for a in msg.get("assets") or []:
                    PRELOADED[str(a.get("id"))] = str(a.get("path"))
                emit({"status": "ok", "cmd": "preload", "count": len(PRELOADED)})
            elif cmd == "validate_assets":
                result = handle_validate_assets(msg)
                emit({"status": "ok", "cmd": "validate_assets", "result": result})
            elif cmd == "micro_render":
                result = handle_micro_render(msg)
                emit({"status": "ok", "cmd": "micro_render", "result": result})
            elif cmd == "reset":
                reset_scene()
                emit({"status": "ok", "cmd": "reset"})
            elif cmd == "render":
                result = handle_render(msg["job"])
                emit({"status": "ok", "cmd": "render", "result": result})
            elif cmd == "quit":
                emit({"status": "ok", "cmd": "quit"})
                break
            else:
                emit({"status": "error", "error": f"unknown cmd {cmd}"})
        except Exception as e:
            emit({"status": "error", "cmd": cmd, "error": str(e)})


if __name__ == "__main__":
    main()
