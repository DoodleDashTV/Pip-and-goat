"""TJ_CREEK_BED_V2 — layered bed with selective reveal zones.

Do not make the whole creek transparent. Three zones share one lock:
A shallow reveal, B mixed reflection/transmission, C deeper reflective.
"""
from __future__ import annotations

from cinematic_hero_v3_land import channel_profile
from cinematic_riverbank_v1 import WATER_Z, point_on_south_shore, riverbank_sample
from cinematic_water_lock_v1 import WATER_LOCK

# Depth below WATER_Z. Physics lock is unchanged.
ZONE_DEPTH = {
    "A": 0.16,  # clear shallow reveal
    "B": 0.26,  # mixed
    "C": 0.40,  # deeper reflective
}

# Hero-corridor x ranges for the three reveal zones.
ZONE_X = (
    ("A", -7.4, -3.6),
    ("B", -3.6, 0.4),
    ("C", 0.4, 4.6),
)

STONE_CLASSES = (
    ("fine_gravel", 0.02, 0.08),
    ("mixed_small", 0.08, 0.18),
    ("medium", 0.18, 0.32),
)


def zone_at(x: float) -> str:
    for name, x0, x1 in ZONE_X:
        if x0 <= x < x1:
            return name
    return "B"


def bed_depth(x: float, y: float) -> float:
    zone = zone_at(x)
    base = ZONE_DEPTH[zone]
    z, biome = riverbank_sample(x, y)
    if biome not in {"bed", "underwater", "wet_shelf"}:
        return max(0.08, WATER_Z - z)
    return base


def bed_slots() -> tuple[tuple[float, float, str, float, str], ...]:
    """(x, y, class, scale, zone) — irregular, mixed sizes, some buried."""
    plan = (
        (-6.8, -0.55, "mixed_small", 0.34, "A"),
        (-6.2, -0.28, "fine_gravel", 0.22, "A"),
        (-5.6, -0.70, "medium", 0.46, "A"),
        (-5.1, -0.18, "mixed_small", 0.30, "A"),
        (-4.4, -0.48, "fine_gravel", 0.20, "A"),
        (-3.9, -0.82, "medium", 0.40, "A"),
        (-3.2, -0.35, "mixed_small", 0.28, "B"),
        (-2.6, -0.62, "medium", 0.44, "B"),
        (-2.0, -0.22, "fine_gravel", 0.18, "B"),
        (-1.4, -0.78, "mixed_small", 0.32, "B"),
        (-0.7, -0.40, "medium", 0.38, "B"),
        (0.1, -0.58, "fine_gravel", 0.20, "B"),
        (0.8, -0.30, "mixed_small", 0.26, "C"),
        (1.5, -0.72, "medium", 0.50, "C"),
        (2.2, -0.44, "fine_gravel", 0.18, "C"),
        (2.9, -0.66, "mixed_small", 0.28, "C"),
        (3.6, -0.24, "medium", 0.42, "C"),
        (-5.9, 0.08, "mixed_small", 0.24, "A"),
        (-1.0, 0.10, "fine_gravel", 0.16, "B"),
        (1.9, 0.06, "mixed_small", 0.22, "C"),
    )
    slots = []
    for x, offset, klass, scale, zone in plan:
        px, py = point_on_south_shore(x, offset=offset)
        slots.append((px, py, klass, scale, zone))
    return tuple(slots)


def silt_pockets() -> tuple[tuple[float, float], ...]:
    return (
        point_on_south_shore(-5.4, offset=-0.85),
        point_on_south_shore(-1.2, offset=-0.90),
        point_on_south_shore(2.4, offset=-0.80),
    )


def creek_bed_v2_payload() -> dict:
    slots = bed_slots()
    zones = {s[4] for s in slots}
    classes = {s[2] for s in slots}
    scales = [s[3] for s in slots]
    return {
        "system": "TJ_CREEK_BED_V2",
        "zones": ["A", "B", "C"],
        "zoneDepth": dict(ZONE_DEPTH),
        "slotCount": len(slots),
        "zonesPresent": sorted(zones),
        "classesPresent": sorted(classes),
        "scaleMin": min(scales),
        "scaleMax": max(scales),
        "notUniform": max(scales) - min(scales) >= 0.20,
        "waterLock": dict(WATER_LOCK),
        "channelUsed": bool(channel_profile(-2.0, -10.0)),
    }
