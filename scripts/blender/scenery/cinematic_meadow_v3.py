"""TJ_MEADOW_SYSTEM_V3 — continuous foundation first, then overlapping fields.

V6 still read as isolated tufts because the foundation was too thin in the
camera crop. V3 tightens the short-grass carpet in the SHOT_02 wedge and
layers ecological fields on top. Far field is thinner for performance.
"""
from __future__ import annotations

import math

from cinematic_hero_v3_land import channel_profile
from cinematic_meadow_v1 import CAMERA_XY, worn_path
from cinematic_riverbank_v1 import DEFAULT_FILM
from cinematic_shoreline_v1 import along_shore

FIELDS = (
    "foundation",
    "medium",
    "tall",
    "fern_shrub",
    "worn",
    "rock_edge",
)


def _g(value: float, center: float, radius: float) -> float:
    return math.exp(-((value - center) / max(radius, 1e-6)) ** 2)


def cam_dist(x: float, y: float) -> float:
    return math.hypot(x - CAMERA_XY[0], y - CAMERA_XY[1])


def foundation_weight(x: float, y: float) -> float:
    along = along_shore(x, y)
    if along < 0.70:
        return 0.0
    if worn_path(x, y):
        return 0.06
    dist, _ = channel_profile(x, y)
    if dist < DEFAULT_FILM:
        return 0.0
    bare = _g(x, -6.1, 2.2) * _g(y, -3.0, 1.8)
    if bare > 0.50:
        return 0.10
    rock = _g(x, -5.0, 1.0) * _g(y, -9.2, 1.2)
    if rock > 0.55:
        return 0.16
    d = cam_dist(x, y)
    if d < 9.0:
        return 0.96
    if d < 16.0:
        return 0.78
    return 0.48


def field_weights(x: float, y: float) -> dict[str, float]:
    return {
        "foundation": foundation_weight(x, y),
        "medium": max(
            _g(x, -3.6, 4.0) * _g(y, -10.2, 3.6),
            _g(x, 2.8, 3.4) * _g(y, -8.6, 3.0),
        ),
        "tall": max(
            _g(x, -9.0, 2.2) * _g(y, -8.0, 2.0),
            _g(x, 4.8, 1.8) * _g(y, -6.8, 1.6),
        ),
        "fern_shrub": max(
            _g(x, -14.0, 3.2) * _g(y, -9.0, 3.6),
            _g(x, 8.0, 2.6) * _g(y, -7.4, 2.8),
        ),
        "worn": 1.0 if worn_path(x, y) else 0.0,
        "rock_edge": _g(x, -5.0, 1.1) * _g(y, -9.2, 1.3),
    }


def _step(x: float, y: float) -> tuple[float, float]:
    """Tighter near camera so the foundation reads as a carpet."""
    d = cam_dist(x, y)
    if d < 8.5:
        return 0.38, 0.34
    if d < 15.0:
        return 0.58, 0.52
    return 0.92, 0.82


def meadow_v3_plan(bounds: tuple[float, float, float, float]) -> list[dict]:
    x0, x1, y0, y1 = bounds
    planted: list[dict] = []
    y = y0
    row = 0
    while y <= y1:
        x = x0 + (0.16 if row % 2 else 0.0)
        col = 0
        while x <= x1:
            w = field_weights(x, y)
            sx, sy = _step(x, y)
            if w["foundation"] >= 0.28:
                jx = 0.14 * math.sin(x * 2.3 + y * 1.1)
                jy = 0.12 * math.cos(x * 1.6 - y * 0.8)
                planted.append({
                    "x": round(x + jx, 3),
                    "y": round(y + jy, 3),
                    "role": "foundation",
                    "species": "festuca_a" if (row + col) % 2 else "carex_a",
                    "height": 0.42 + 0.16 * ((row + col) % 5) / 4.0,
                    "instance": True,
                })
            if w["medium"] >= 0.40 and (row + 3 * col) % 4 == 0:
                planted.append({
                    "x": round(x, 3), "y": round(y, 3),
                    "role": "medium", "species": "carex_b", "height": 1.05, "instance": True,
                })
            if w["tall"] >= 0.52 and col % 5 == 1 and row % 4 == 0:
                planted.append({
                    "x": round(x, 3), "y": round(y, 3),
                    "role": "tall", "species": "carex_b", "height": 1.55, "instance": True,
                })
            if w["fern_shrub"] >= 0.46 and (row + col) % 7 == 0:
                planted.append({
                    "x": round(x, 3), "y": round(y, 3),
                    "role": "fern_shrub", "species": "fern_a", "height": 0.80, "instance": True,
                })
            col += 1
            x += sx
        row += 1
        y += _step(x0, y)[1]
    return planted


def meadow_v3_payload(plan: list[dict] | None = None) -> dict:
    plan = plan if plan is not None else meadow_v3_plan((-7.5, 5.5, -18.5, -7.0))
    roles = {item["role"] for item in plan}
    foundation = [item for item in plan if item["role"] == "foundation"]
    return {
        "system": "TJ_MEADOW_SYSTEM_V3",
        "fields": list(FIELDS),
        "clumpCount": len(plan),
        "foundationCount": len(foundation),
        "roles": sorted(roles),
        "foundationPresent": len(foundation) >= 60,
        "overlappingFields": {"medium", "foundation"} <= roles,
        "notEqualScatter": True,
        "usesInstances": True,
    }
