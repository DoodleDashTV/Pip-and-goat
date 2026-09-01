"""Authored V3 hero landforms. No Blender import."""
from __future__ import annotations

import math

WATER_Z = -1.15
BED_Z = -1.50
RIVER = (
    (-44.0, -22.0), (-36.0, -18.4), (-30.0, -15.0), (-22.0, -17.2),
    (-16.0, -10.5), (-8.0, -8.6), (-2.0, -12.2), (6.0, -8.0),
    (12.0, -9.0), (20.0, -14.8), (26.0, -13.5), (34.0, -16.6), (42.0, -19.0),
)


def channel_profile(x: float, y: float) -> tuple[float, float]:
    """Distance to river polyline and signed side (left positive)."""
    best = 1e9
    signed = 0.0
    for i in range(len(RIVER) - 1):
        ax, ay = RIVER[i]
        bx, by = RIVER[i + 1]
        vx, vy = bx - ax, by - ay
        length = math.hypot(vx, vy) or 1.0
        t = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / (length * length)))
        px, py = ax + t * vx, ay + t * vy
        dx, dy = x - px, y - py
        dist = math.hypot(dx, dy)
        if dist < best:
            best = dist
            signed = (vx * dy - vy * dx) / length
    return best, signed


def authored_height(x: float, y: float) -> tuple[float, str]:
    """Broad sculpted landforms. Returns (z, biome)."""
    dist, signed = channel_profile(x, y)
    film = 1.62
    gravel = 2.55
    soil = 3.85
    path = abs((x + 6.2) * 0.55 + (y + 4.0) * 0.84)
    meadow_roll = 0.16 * math.sin(x * 0.11 + 0.4) + 0.11 * math.sin(y * 0.08 + 1.1)
    meadow_roll += 0.07 * math.sin((x + y) * 0.05)
    meadow_z = 0.42 + meadow_roll
    if path < 1.15 and dist > gravel:
        meadow_z -= 0.16 * (1.0 - path / 1.15)
    if dist <= film:
        t = 1.0 - dist / max(film, 1e-4)
        return BED_Z - 0.10 * t, "bed"
    if dist <= gravel:
        t = (dist - film) / max(gravel - film, 1e-4)
        t = t * t * (3.0 - 2.0 * t)
        z = BED_Z * (1.0 - t) + (-0.22) * t
        return z, "gravel"
    if dist <= soil:
        t = (dist - gravel) / max(soil - gravel, 1e-4)
        t = t * t * (3.0 - 2.0 * t)
        z = (-0.22) * (1.0 - t) + meadow_z * t
        if signed < 0:
            z -= 0.06 * (1.0 - t)
        return z, "soil"
    if path < 1.15:
        return meadow_z, "path"
    if dist < 6.4:
        return meadow_z, "short"
    return meadow_z + 0.04, "lush"
