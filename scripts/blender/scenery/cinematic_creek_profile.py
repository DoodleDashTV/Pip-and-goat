"""Pure helpers for the V37 creek-bank and composition repair.

This module deliberately has no Blender dependency so the geometry intent can
be tested before an expensive or credentialed render environment is available.
"""
from __future__ import annotations

import math


HERO_X_MIN = -12.0
HERO_X_MAX = 8.0


def _gaussian(value: float, center: float, radius: float) -> float:
    return math.exp(-((value - center) / max(radius, 1e-6)) ** 2)


def hero_north_notch_depth(x: float, along: float) -> float:
    """Return broad north-bank breakup depth in metres.

    Three overlapping slumps replace the single traceable crest. The result is
    zero outside camera C's hero corridor and never alters the creek trough.
    """
    if x < HERO_X_MIN or x > HERO_X_MAX:
        return 0.0
    slumps = (
        0.70 * _gaussian(x, -8.4, 2.20),
        0.52 * _gaussian(x, -5.4, 1.55),
        0.86 * _gaussian(x, -2.6, 2.55),
        0.50 * _gaussian(x, 1.1, 1.70),
        0.62 * _gaussian(x, 4.8, 1.95),
        0.46 * _gaussian(x, -10.6, 1.80),
        0.54 * _gaussian(x, 6.8, 2.05),
    )
    modulation = 0.86 + 0.14 * math.sin(along * 0.61 + x * 0.37)
    return min(1.05, sum(slumps) * modulation)


def hero_north_wet_tongue(x: float, y: float, along: float) -> float:
    """Return a discontinuous 0..1 soil tongue mask for the visible far bank."""
    if x < HERO_X_MIN or x > HERO_X_MAX:
        return 0.0
    broad = max(
        _gaussian(x, -8.0, 2.8),
        _gaussian(x, -5.1, 1.65),
        _gaussian(x, -1.8, 3.1),
        _gaussian(x, 1.4, 1.70),
        _gaussian(x, 5.0, 2.3),
        _gaussian(x, -11.2, 2.1),
        _gaussian(x, 7.2, 2.2),
    )
    broken = 0.5 + 0.5 * math.sin(x * 1.17 + y * 0.53 + along * 0.31)
    broken *= 0.58 + 0.42 * (0.5 + 0.5 * math.cos(x * 0.63 - along * 0.47))
    gaps = 0.22 + 0.78 * (0.5 + 0.5 * math.sin(x * 2.31 + along * 0.73))
    return max(0.0, min(1.0, broad * (0.34 + 0.66 * broken) * gaps))


def hero_waterline_bite(x: float, along: float) -> float:
    """Signed metres at the waterline. + bank retreats, - grass/soil overhangs.

    Bays are a few metres wide so they survive 540 px. The creek trough width
    (WATER_WIDTH_SCALE) is not changed; only the terrain contour moves.
    """
    if x < HERO_X_MIN or x > HERO_X_MAX:
        return 0.0
    bays = (
        1.05 * _gaussian(x, -7.6, 1.20),
        -0.72 * _gaussian(x, -5.2, 0.82),
        1.18 * _gaussian(x, -2.4, 1.40),
        -0.58 * _gaussian(x, 0.2, 0.70),
        0.88 * _gaussian(x, 2.8, 1.10),
        -0.64 * _gaussian(x, 5.0, 0.88),
        0.76 * _gaussian(x, -10.2, 1.05),
        0.62 * _gaussian(x, 6.8, 0.84),
        -0.50 * _gaussian(x, -8.8, 0.62),
    )
    wobble = 0.18 * math.sin(along * 1.55 + x * 0.83)
    return max(-0.80, min(1.15, sum(bays) + wobble))


def hero_grass_lip(x: float, along: float) -> float:
    """Terrain-only lip, phase-shifted from hero_waterline_bite.

    Water and grass must not share one isoline. Positive values pull grass
    back; negative values push a soil/grass tongue over the water.
    """
    if x < HERO_X_MIN or x > HERO_X_MAX:
        return 0.0
    lips = (
        0.88 * _gaussian(x, -6.1, 1.05),
        -0.64 * _gaussian(x, -3.8, 0.78),
        0.96 * _gaussian(x, -0.6, 1.25),
        -0.50 * _gaussian(x, 1.8, 0.68),
        0.72 * _gaussian(x, 4.4, 1.00),
        -0.56 * _gaussian(x, -9.4, 0.72),
        0.60 * _gaussian(x, 7.2, 0.90),
        0.44 * _gaussian(x, -1.8, 0.58),
    )
    wobble = 0.14 * math.sin(along * 1.22 + x * 0.61)
    return max(-0.70, min(1.00, sum(lips) + wobble))


# V44: 6 camera-readable south-bank events. emerge + metres = water covers more bank.
HERO_MACRO_EVENTS = (
    (-9.6, 1.90, "boulder", 0.45, 3.10),
    (-6.6, 1.75, "bay", 1.90, 5.80),
    (-3.6, 1.50, "point", -1.20, 2.70),
    (-0.6, 1.55, "boulder", 0.25, 3.40),
    (2.4, 1.65, "gravel", 1.30, 5.10),
    (5.6, 1.55, "cut", 1.60, 3.50),
)

# (x, edge, scale, bury). edge 1 = film, <1 in water. Left-weighted for SHOT_02.
HERO_MACRO_ROCKS = (
    (-10.05, 0.70, 4.20, 0.50),
    (-8.65, 1.10, 3.15, 0.44),
    (-3.70, 0.66, 3.55, 0.46),
    (-0.45, 0.86, 4.05, 0.52),
    (2.55, 1.22, 2.75, 0.40),
)


def hero_macro_event(x: float) -> dict:
    """One blended south-bank event. Used by terrain, water, and rocks."""
    empty = {"kind": "none", "emerge": 0.0, "rise": 4.2, "weight": 0.0}
    if x < HERO_X_MIN or x > HERO_X_MAX:
        return empty
    weight_sum = 0.0
    emerge = rise = 0.0
    best_kind = "none"
    best_w = 0.0
    for cx, radius, kind, em, rs in HERO_MACRO_EVENTS:
        ww = _gaussian(x, cx, radius)
        emerge += em * ww
        rise += rs * ww
        weight_sum += ww
        if ww > best_w:
            best_w = ww
            best_kind = kind
    if weight_sum < 0.06:
        return empty
    inv = 1.0 / weight_sum
    return {
        "kind": best_kind,
        "emerge": max(-1.40, min(2.10, emerge * inv)),
        "rise": max(2.40, min(6.40, rise * inv)),
        "weight": min(1.0, best_w),
    }


def hero_south_water_factor(x: float) -> float:
    """Modest local film scale so water occupies bays. Not a global widen."""
    if x < HERO_X_MIN or x > HERO_X_MAX:
        return 1.0
    event = hero_macro_event(x)
    kind = event["kind"]
    weight = event["weight"]
    if kind == "bay":
        return max(0.72, min(1.48, 1.0 + 0.40 * weight))
    if kind == "point":
        return max(0.72, min(1.48, 1.0 - 0.20 * weight))
    if kind == "cut":
        return max(0.72, min(1.48, 1.0 + 0.26 * weight))
    if kind == "gravel":
        return max(0.72, min(1.48, 1.0 + 0.18 * weight))
    return 1.0


def hero_rock_collar(x: float, y: float) -> float:
    """Negative metres so terrain sockets around embedded hero rocks."""
    dip = 0.0
    for px, _edge, scale, bury in HERO_MACRO_ROCKS:
        # Rocks sit near the south lip; a wide Gaussian is enough without Y.
        w = _gaussian(x, px, 0.85 + 0.18 * scale)
        dip = max(dip, w * scale * bury * 0.16)
    return dip


def hero_shore_event(x: float) -> dict:
    """Compatibility view of V44 macro events for remaining callers."""
    empty = {"kind": "none", "soil": 1.7, "damp": 1.05, "wet": 0.55, "water": 0.0, "grass": 0.12}
    event = hero_macro_event(x)
    if event["kind"] == "none":
        return empty
    kind = event["kind"]
    emerge = event["emerge"]
    rise = event["rise"]
    soil = 0.55 + 0.35 * max(0.0, emerge)
    damp = 0.20 + 0.28 * max(0.0, emerge)
    wet = 0.08 + 0.18 * max(0.0, emerge)
    grass = 0.45 if kind == "point" else 0.06
    if kind == "gravel":
        soil, damp, wet, grass = 1.80, 1.20, 0.85, 0.03
    return {
        "kind": kind,
        "soil": max(0.50, soil),
        "damp": max(0.12, damp),
        "wet": max(0.05, wet),
        "water": max(-0.42, min(0.95, emerge * 0.48)),
        "grass": max(0.0, grass),
        "rise": rise,
        "emerge": emerge,
    }


def hero_south_wet_tongue(x: float, y: float, along: float) -> float:
    """Discontinuous soil on the camera-side bank so grass cannot hold one lip."""
    if x < HERO_X_MIN or x > HERO_X_MAX:
        return 0.0
    broad = max(
        _gaussian(x, -9.2, 2.3),
        _gaussian(x, -4.0, 2.5),
        _gaussian(x, 0.6, 1.9),
        _gaussian(x, 5.4, 2.2),
        _gaussian(x, -11.4, 2.0),
        _gaussian(x, 7.0, 2.4),
    )
    broken = 0.5 + 0.5 * math.sin(x * 1.41 + y * 0.47 + along * 0.29)
    return max(0.0, min(1.0, broad * (0.30 + 0.70 * broken)))
