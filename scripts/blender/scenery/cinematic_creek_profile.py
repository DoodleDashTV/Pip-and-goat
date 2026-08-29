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
        0.52 * _gaussian(x, -8.4, 1.65),
        0.68 * _gaussian(x, -2.6, 2.05),
        0.46 * _gaussian(x, 4.8, 1.45),
    )
    modulation = 0.86 + 0.14 * math.sin(along * 0.61 + x * 0.37)
    return min(0.72, sum(slumps) * modulation)


def hero_north_wet_tongue(x: float, y: float, along: float) -> float:
    """Return a discontinuous 0..1 soil tongue mask for the visible far bank."""
    if x < HERO_X_MIN or x > HERO_X_MAX:
        return 0.0
    broad = max(
        _gaussian(x, -8.0, 2.2),
        _gaussian(x, -1.8, 2.5),
        _gaussian(x, 5.0, 1.8),
    )
    broken = 0.5 + 0.5 * math.sin(x * 1.17 + y * 0.53 + along * 0.31)
    broken *= 0.58 + 0.42 * (0.5 + 0.5 * math.cos(x * 0.63 - along * 0.47))
    return max(0.0, min(1.0, broad * (0.38 + 0.62 * broken)))
