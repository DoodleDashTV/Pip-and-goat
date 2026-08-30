"""TJ_SHORELINE_TRANSITION_V1 — overlapping physical cues, not a color isoline.

The V5 razor was a material/color step at WATER ∩ TERRAIN plus dressing
parked on meadow (Y≈-16) instead of the real waterline. Geometry was already
continuous. This module defines a real-width transition and cue placements.
"""
from __future__ import annotations

from cinematic_riverbank_v1 import point_on_south_shore, shoreline_distance

# Metres along signed shore distance. 0 = TERRAIN ∩ WATER. + landward, - waterward.
TRANSITION_WIDTH = 1.90

# Overlapping bands. A sample may belong to more than one cue.
BANDS = (
    ("underwater_bed", -1.15, -0.08),
    ("submerged_stone", -0.52, 0.12),
    ("fine_gravel", -0.10, 0.52),
    ("wet_soil", 0.06, 0.72),
    ("damp_soil", 0.40, 1.18),
    ("dry_soil", 0.85, 1.58),
    ("grass_root", 1.20, 1.90),
)

# Colors lerp across along. No step at 0.
_STOPS = (
    (-0.90, (0.18, 0.14, 0.10)),
    (-0.20, (0.24, 0.18, 0.12)),
    (0.15, (0.28, 0.18, 0.11)),
    (0.55, (0.30, 0.20, 0.12)),
    (1.05, (0.29, 0.21, 0.12)),
    (1.70, (0.24, 0.23, 0.13)),
)


def along_shore(x: float, y: float) -> float:
    emerge = shoreline_distance(x, south=True)
    from cinematic_hero_v3_land import channel_profile
    dist, signed = channel_profile(x, y)
    if signed >= 0:
        return dist  # north bank: treat as landward
    return dist - emerge


def _lerp_color(along: float) -> tuple[float, float, float]:
    if along <= _STOPS[0][0]:
        return _STOPS[0][1]
    if along >= _STOPS[-1][0]:
        return _STOPS[-1][1]
    for i in range(len(_STOPS) - 1):
        a0, c0 = _STOPS[i]
        a1, c1 = _STOPS[i + 1]
        if a0 <= along <= a1:
            t = (along - a0) / max(a1 - a0, 1e-6)
            return (
                c0[0] + (c1[0] - c0[0]) * t,
                c0[1] + (c1[1] - c0[1]) * t,
                c0[2] + (c1[2] - c0[2]) * t,
            )
    return _STOPS[-1][1]


def transition_color(x: float, y: float) -> tuple[float, float, float, float]:
    along = along_shore(x, y)
    r, g, b = _lerp_color(along)
    return (r, g, b, 1.0)


def active_bands(along: float) -> tuple[str, ...]:
    return tuple(name for name, lo, hi in BANDS if lo <= along <= hi)


def cue_slots() -> tuple[tuple[float, float, str, float], ...]:
    """(x, y, cue, scale) on the real south waterline."""
    plan = (
        (-8.4, -0.95, "underwater_bed", 0.42),
        (-6.8, -0.48, "submerged_stone", 0.55),
        (-6.2, 0.12, "fine_gravel", 0.38),
        (-4.1, -0.22, "submerged_stone", 0.48),
        (-2.2, 0.18, "fine_gravel", 0.34),
        (-0.4, -0.10, "submerged_stone", 0.42),
        (1.6, 0.28, "wet_soil", 0.30),
        (3.4, -0.18, "submerged_stone", 0.50),
        (5.2, 0.22, "fine_gravel", 0.36),
        (-7.1, 0.55, "damp_soil", 0.28),
        (-3.0, 1.05, "dry_soil", 0.32),
        (0.8, 1.45, "grass_root", 0.90),
        (4.6, 1.62, "grass_root", 0.85),
        (2.4, -0.72, "underwater_bed", 0.36),
    )
    slots = []
    for x, offset, cue, scale in plan:
        px, py = point_on_south_shore(x, offset=offset)
        slots.append((px, py, cue, scale))
    return tuple(slots)


def transition_width_ok(samples: list[tuple[float, float]]) -> bool:
    """True if the visible band spans real metres, not a single isoline."""
    alongs = [along_shore(x, y) for x, y in samples]
    return max(alongs) - min(alongs) >= 1.20
