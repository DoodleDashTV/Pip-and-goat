"""
First paid GPU benchmark — FINAL_1080P representative 1s shot (30 frames).
Runs headlessly on Runpod; fails closed if NVIDIA GPU is missing.
Never prints secrets.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(os.environ.get("DDP_BENCH_ROOT", "/workspace/ddp-bench")).resolve()
LIB = ROOT / "production-library"
OUT = ROOT / "out" / "final_rep_1s"
REPORT = ROOT / "out" / "gpu-benchmark-report.json"


def emit(msg: str) -> None:
    print(f"DDP_GPU_BENCH: {msg}", flush=True)


def require_nvidia() -> dict:
    res = subprocess.run(
        ["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"],
        capture_output=True,
        text=True,
    )
    if res.returncode != 0:
        raise RuntimeError(f"nvidia-smi failed: {res.stderr or res.stdout}")
    line = (res.stdout or "").strip().splitlines()[0]
    parts = [p.strip() for p in line.split(",")]
    return {
        "gpuModel": parts[0] if parts else "UNKNOWN",
        "vramMiB": float(parts[1]) if len(parts) > 1 and parts[1] else None,
        "driver": parts[2] if len(parts) > 2 else None,
    }


def sample_gpu_util() -> float | None:
    res = subprocess.run(
        ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
        capture_output=True,
        text=True,
    )
    if res.returncode != 0:
        return None
    try:
        return float((res.stdout or "0").strip().splitlines()[0])
    except ValueError:
        return None


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


def apply_action(arm, action_name):
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


def configure_camera(scene, width: int, height: int):
    import bpy

    cam = scene.camera
    if not cam:
        cam_data = bpy.data.cameras.new("ProdCam")
        cam = bpy.data.objects.new("ProdCam", cam_data)
        bpy.context.collection.objects.link(cam)
        scene.camera = cam
    cam.location = (0.2, -5.5, 1.8)
    cam.rotation_euler = (math.radians(80), 0, 0)
    cam.data.lens = 35
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100


def set_eevee(scene, samples: int):
    import bpy

    # Prefer EEVEE Next when available (Blender 4.2+)
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = max(1, samples)


def try_enable_gpu_prefs() -> dict:
    import bpy

    info = {"computeDeviceType": None, "cyclesDevices": [], "systemBackend": None}
    try:
        prefs = bpy.context.preferences
        if hasattr(prefs.system, "gpu_backend"):
            info["systemBackend"] = str(prefs.system.gpu_backend)
        cycles = prefs.addons.get("cycles")
        if cycles:
            cprefs = cycles.preferences
            for dtype in ("CUDA", "OPTIX", "HIP", "METAL", "ONEAPI"):
                try:
                    cprefs.compute_device_type = dtype
                    cprefs.get_devices()
                    devices = []
                    for d in getattr(cprefs, "devices", []):
                        try:
                            d.use = "CPU" not in d.type
                            devices.append({"name": d.name, "type": d.type, "use": bool(d.use)})
                        except Exception:
                            pass
                    if any(d["use"] for d in devices):
                        info["computeDeviceType"] = dtype
                        info["cyclesDevices"] = devices
                        break
                except Exception:
                    continue
    except Exception as e:
        info["error"] = str(e)
    return info


def main() -> int:
    wall0 = time.time()
    gpu = require_nvidia()
    emit(f"gpu={gpu['gpuModel']}")

    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)
    gpu_prefs = try_enable_gpu_prefs()

    assets = [
        {"id": "pip", "path": str(LIB / "characters/pip_production.blend")},
        {"id": "goat", "path": str(LIB / "characters/goat_production.blend")},
        {"id": "meadow", "path": str(LIB / "environments/meadow_production.blend")},
        {"id": "map", "path": str(LIB / "props/adventure_map.blend")},
    ]
    for a in assets:
        if not Path(a["path"]).exists():
            raise FileNotFoundError(a["path"])

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("frame_*.png"):
        old.unlink()
    mp4 = OUT / "shot.mp4"
    if mp4.exists():
        mp4.unlink()

    width, height = 1080, 1920
    fps = 30
    samples = int(os.environ.get("DDP_BENCH_SAMPLES", "20"))
    start_frame, end_frame = 1, 30
    placements = {
        "pip": {"location": [-0.7, 0, 0], "action": "PIP_TALK"},
        "goat": {"location": [0.9, 0, 0], "action": "GOAT_TALK"},
        "meadow": {"location": [0, 0, 0]},
        "map": {"location": [0, 0.35, 0.05]},
    }

    timings: dict = {}
    scene = bpy.context.scene
    scene.render.fps = fps
    scene.frame_start = start_frame
    scene.frame_end = end_frame

    t = time.time()
    imported = {}
    for asset in assets:
        imported[asset["id"]] = append_blend(asset["path"])
    timings["asset_loading_ms"] = int((time.time() - t) * 1000)

    t = time.time()
    for role, objs in imported.items():
        arm = find_armature(objs)
        target = arm or next((o for o in objs if o.type == "MESH"), None)
        if not target:
            continue
        place = placements.get(role) or {}
        if "location" in place:
            target.location = tuple(place["location"])
        apply_action(arm, place.get("action"))
    ensure_sky(scene)
    configure_camera(scene, width, height)
    set_eevee(scene, samples)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(OUT / "frame_")
    timings["scene_assembly_ms"] = int((time.time() - t) * 1000)

    util_before = sample_gpu_util()
    emit(f"render_start util={util_before}")
    t = time.time()
    bpy.ops.render.render(animation=True)
    timings["frame_render_ms"] = int((time.time() - t) * 1000)
    util_after = sample_gpu_util()
    emit(f"render_done ms={timings['frame_render_ms']} util={util_after}")

    frames = sorted(OUT.glob("frame_*.png"))
    frame_count = len(frames)
    if frame_count < end_frame:
        raise RuntimeError(f"Expected {end_frame} frames, got {frame_count}")

    t = time.time()
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            str(fps),
            "-pattern_type",
            "glob",
            "-i",
            str(OUT / "frame_*.png"),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "18",
            str(mp4),
        ],
        check=False,
        capture_output=True,
    )
    timings["ffmpeg_encoding_ms"] = int((time.time() - t) * 1000)

    wall_ms = int((time.time() - wall0) * 1000)
    seconds_per_frame = (timings["frame_render_ms"] / 1000 / frame_count) if frame_count else None
    report = {
        "ok": True,
        "profile": "FINAL_1080P",
        "resolution": f"{width}x{height}",
        "fps": fps,
        "samples": samples,
        "frames": frame_count,
        "engine": scene.render.engine,
        "gpu": gpu,
        "gpuPrefs": gpu_prefs,
        "gpuUtilBefore": util_before,
        "gpuUtilAfter": util_after,
        "wallMs": wall_ms,
        "secondsPerFrame": seconds_per_frame,
        "timings": timings,
        "mp4Present": mp4.exists(),
        "mp4Bytes": mp4.stat().st_size if mp4.exists() else 0,
        "cpuBaselineFinalRep1sMs": 127436,
        "cpuBaselineDiagnostic10sMs": 746000,
        "note": "Representative FINAL_1080P 1s (30f) Pip+Goat+meadow+map TWO_SHOT",
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2))
    emit(f"REPORT_PATH={REPORT}")
    emit(f"WALL_MS={wall_ms}")
    emit("COMPLETE")
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        err = {"ok": False, "error": str(e)}
        try:
            REPORT.parent.mkdir(parents=True, exist_ok=True)
            REPORT.write_text(json.dumps(err, indent=2))
        except Exception:
            pass
        emit(f"FAILED {e}")
        print(json.dumps(err))
        raise SystemExit(1)
