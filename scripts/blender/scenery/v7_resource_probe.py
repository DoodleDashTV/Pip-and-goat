"""In-process resource snapshots for V7 execution recovery. No art changes."""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path


def _meminfo() -> dict:
    info = {}
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            key, rest = line.split(":", 1)
            info[key] = int(rest.strip().split()[0]) * 1024
    except OSError:
        pass
    return {
        "memTotal": info.get("MemTotal"),
        "memAvailable": info.get("MemAvailable"),
        "memFree": info.get("MemFree"),
        "swapTotal": info.get("SwapTotal"),
        "swapFree": info.get("SwapFree"),
    }


def _self_rss() -> int | None:
    try:
        for line in Path("/proc/self/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1]) * 1024
            if line.startswith("VmHWM:"):
                # captured later
                pass
    except OSError:
        return None
    return None


def _self_hwm() -> int | None:
    try:
        for line in Path("/proc/self/status").read_text().splitlines():
            if line.startswith("VmHWM:"):
                return int(line.split()[1]) * 1024
    except OSError:
        return None
    return None


def _disk(path: str = "/") -> dict:
    st = os.statvfs(path)
    return {
        "diskTotal": st.f_frsize * st.f_blocks,
        "diskFree": st.f_frsize * st.f_bavail,
    }


def snapshot(label: str, extra: dict | None = None) -> dict:
    row = {
        "event": "resource_snapshot",
        "label": label,
        "ts": time.time(),
        "rss": _self_rss(),
        "hwm": _self_hwm(),
        **_meminfo(),
        **_disk(),
    }
    if extra:
        row.update(extra)
    print(json.dumps(row), flush=True)
    return row


def scene_counts() -> dict:
    try:
        import bpy
    except ImportError:
        return {}
    verts = sum(len(m.vertices) for m in bpy.data.meshes)
    faces = sum(len(m.polygons) for m in bpy.data.meshes)
    return {
        "objects": len(bpy.data.objects),
        "meshes": len(bpy.data.meshes),
        "materials": len(bpy.data.materials),
        "images": len(bpy.data.images),
        "vertices": verts,
        "faces": faces,
    }


class PeakTracker:
    def __init__(self, interval: float = 0.5) -> None:
        self.peak_rss = 0
        self._stop = threading.Event()
        self._t = threading.Thread(target=self._run, args=(interval,), daemon=True)

    def start(self) -> None:
        self._t.start()

    def stop(self) -> int:
        self._stop.set()
        self._t.join(timeout=2)
        hwm = _self_hwm() or 0
        return max(self.peak_rss, hwm)

    def _run(self, interval: float) -> None:
        while not self._stop.is_set():
            rss = _self_rss() or 0
            if rss > self.peak_rss:
                self.peak_rss = rss
            self._stop.wait(interval)
