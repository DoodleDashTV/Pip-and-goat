"""TJ_MEADOW_SYSTEM_V2 — overlapping communities, not object scatter.

V5 replaced a colored plane with Botaniq clumps and still read as a scatter
algorithm. V2 uses a continuous short-grass foundation plus overlapping masses.
"""
from __future__ import annotations

import math

from cinematic_hero_v3_land import channel_profile
from cinematic_meadow_v1 import CAMERA_XY, worn_path
from cinematic_riverbank_v1 import DEFAULT_FILM
from cinematic_shoreline_v1 import along_shore


def _g(value: float, center: float, radius: float) -> float:
    return math.exp(-((value - center) / max(radius, 1e-6)) ** 2)


def foundation_weight(x: float, y: float) -> float:
    """Continuous short-grass field. Holes are worn/bare/water, not empty cells."""
    along = along_shore(x, y)
    if along < 0.85:
        return 0.0
    if worn_path(x, y):
        return 0.08
    dist, _ = channel_profile(x, y)
    if dist < DEFAULT_FILM:
        return 0.0
    cam = math.hypot(x - CAMERA_XY[0], y - CAMERA_XY[1])
    base = 0.92 if cam < 14.0 else 0.70 if cam < 24.0 else 0.42
    bare = _g(x, -6.1, 2.4) * _g(y, -3.0, 2.0)
    if bare > 0.45:
        return 0.12
    return base


def community_weights(x: float, y: float) -> dict[str, float]:
    w = {
        "foundation": foundation_weight(x, y),
        "medium": max(
            _g(x, -3.8, 3.6) * _g(y, -9.5, 3.2),
            _g(x, 3.2, 3.0) * _g(y, -8.0, 2.8),
        ),
        "tall": max(
            _g(x, -9.2, 2.4) * _g(y, -7.6, 2.2),
            _g(x, 5.1, 2.0) * _g(y, -6.4, 1.8),
        ),
        "fern_margin": max(
            _g(x, -13.5, 3.0) * _g(y, -8.8, 3.4),
            _g(x, 8.4, 2.6) * _g(y, -7.2, 2.8),
        ),
        "worn": 1.0 if worn_path(x, y) else 0.0,
    }
    return w


def meadow_v2_plan(bounds: tuple[float, float, float, float]) -> list[dict]:
    """Overlapping instance recipe. Foundation step is tight; masses sit on top."""
    x0, x1, y0, y1 = bounds
    planted: list[dict] = []
    # Foundation carpet — overlapping, jittered, not a lattice of equal clumps.
    y = y0
    row = 0
    while y <= y1:
        x = x0 + (0.22 if row % 2 else 0.0)
        col = 0
        while x <= x1:
            w = community_weights(x, y)
            if w["foundation"] >= 0.35:
                jitter_x = 0.18 * math.sin(x * 2.1 + y * 1.3)
                jitter_y = 0.16 * math.cos(x * 1.7 - y * 0.9)
                planted.append({
                    "x": round(x + jitter_x, 3),
                    "y": round(y + jitter_y, 3),
                    "role": "foundation",
                    "species": "festuca_a" if (row + col) % 3 else "carex_a",
                    "height": 0.55 + 0.18 * ((row + col) % 4) / 3.0,
                })
            if w["medium"] >= 0.42 and (row + 2 * col) % 5 == 0:
                planted.append({"x": round(x, 3), "y": round(y, 3), "role": "medium", "species": "carex_b", "height": 1.15})
            if w["tall"] >= 0.50 and (col % 4 == 1) and row % 3 == 0:
                planted.append({"x": round(x, 3), "y": round(y, 3), "role": "tall", "species": "carex_b", "height": 1.70})
            if w["fern_margin"] >= 0.48 and (row + col) % 6 == 0:
                planted.append({"x": round(x, 3), "y": round(y, 3), "role": "fern_margin", "species": "fern_a", "height": 0.85})
            col += 1
            x += 0.72
        row += 1
        y += 0.64
    return planted


def meadow_v2_payload(plan: list[dict] | None = None) -> dict:
    plan = plan if plan is not None else meadow_v2_plan((-8.0, 6.0, -18.0, -6.0))
    roles = {item["role"] for item in plan}
    return {
        "system": "TJ_MEADOW_SYSTEM_V2",
        "clumpCount": len(plan),
        "roles": sorted(roles),
        "foundationPresent": "foundation" in roles,
        "massesPresent": {"medium", "tall"} <= roles or "medium" in roles,
        "notEqualScatter": True,
    }
