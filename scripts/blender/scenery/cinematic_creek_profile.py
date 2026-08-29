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
