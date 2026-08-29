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


def hero_shore_event(x: float) -> dict:
    """Blend 8 irregular SHOT_02 south-bank events. Distances are metres.

    Keys:
    soil/damp/wet: outward run from the water film edge
    water: signed water-edge offset (+ into bank, - grass overhang)
    grass: extra grass run past the soil
    """
    empty = {"kind": "none", "soil": 1.7, "damp": 1.05, "wet": 0.55, "water": 0.0, "grass": 0.12}
    if x < HERO_X_MIN or x > HERO_X_MAX:
        return empty
    events = (
        (-10.4, 1.15, "retreat", 3.15, 2.20, 0.42, 0.48, 0.02),
        (-7.8, 0.95, "inlet", 0.95, 0.42, 0.14, 0.88, 0.00),
        (-5.6, 0.80, "rock", 1.25, 0.70, 0.40, 0.04, 0.08),
        (-3.2, 1.20, "bay", 3.40, 2.45, 1.45, 0.62, 0.00),
        (-0.6, 0.88, "overhang", 0.70, 0.22, 0.08, -0.36, 0.62),
        (1.8, 0.95, "gravel", 2.15, 1.55, 1.15, 0.28, 0.02),
        (4.2, 1.15, "shelf", 3.85, 2.85, 1.70, 0.10, 0.04),
        (6.6, 0.92, "cut", 1.05, 0.48, 0.16, 0.78, 0.02),
    )
    weight_sum = 0.0
    soil = damp = wet = water = grass = 0.0
    best_kind = "blend"
    best_w = 0.0
    for cx, radius, kind, s, d, w, wat, g in events:
        ww = _gaussian(x, cx, radius)
        soil += s * ww
        damp += d * ww
        wet += w * ww
        water += wat * ww
        grass += g * ww
        weight_sum += ww
        if ww > best_w:
            best_w = ww
            best_kind = kind
    if weight_sum < 0.08:
        return empty
    inv = 1.0 / weight_sum
    return {
        "kind": best_kind,
        "soil": max(0.50, soil * inv),
        "damp": max(0.12, damp * inv),
        "wet": max(0.05, wet * inv),
        "water": max(-0.42, min(0.95, water * inv)),
        "grass": max(0.0, grass * inv),
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
