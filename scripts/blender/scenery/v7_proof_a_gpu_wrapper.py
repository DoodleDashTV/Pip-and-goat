#!/usr/bin/env python3
"""Paid Proof A GPU wrapper. No art changes. Forces Cycles GPU on the worker."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cinematic_component_recovery_v6 as v6
import cinematic_contextual_recovery_v7 as v7


def _log(event: str, **payload) -> None:
    print(json.dumps({"event": event, **payload}), flush=True)


def enable_cycles_gpu() -> dict:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "CUDA"
    prefs.get_devices()
    enabled = []
    for device in prefs.devices:
        use = "GPU" in str(device.type)
        device.use = use
        enabled.append({"name": device.name, "type": str(device.type), "use": bool(device.use)})
    _log("CYCLES_DEVICE_VERIFIED", devices=enabled, sceneDevice=scene.cycles.device)
    _log("cycles_gpu_enabled", devices=enabled, sceneDevice=scene.cycles.device)
    return {"sceneDevice": scene.cycles.device, "devices": enabled}


def reset_scene_gpu() -> None:
    v6._reset_scene_cpu()
    enable_cycles_gpu()


def nvidia_smi() -> dict:
    try:
        raw = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,memory.used,memory.free",
                "--format=csv,noheader,nounits",
            ],
            text=True,
            timeout=15,
        ).strip()
    except (OSError, subprocess.SubprocessError) as exc:
        return {"ok": False, "error": type(exc).__name__}
    parts = [p.strip() for p in raw.split(",")]
    if len(parts) < 4:
        return {"ok": False, "raw": raw}
    return {
        "ok": True,
        "name": parts[0],
        "vramTotalMiB": float(parts[1]),
        "vramUsedMiB": float(parts[2]),
        "vramFreeMiB": float(parts[3]),
    }


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    _log("wrapper_start", nvidia=nvidia_smi(), argv=argv)
    v6._reset_scene_cpu = v6.reset_scene
    v6.reset_scene = reset_scene_gpu
    _log("RENDER_STARTED")
    rc = v7.main(argv)
    _log("wrapper_done", rc=rc, nvidia=nvidia_smi())
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
