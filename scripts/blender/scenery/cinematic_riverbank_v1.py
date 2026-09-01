"""TJ_RIVERBANK_GENERATOR_V1 — reusable terrain-driven creek banks.

No Blender import. Shoreline is TERRAIN ∩ WATER, not a constructed lip.
Suitable for creeks, streams, small rivers, and future scenery episodes.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass

from cinematic_hero_v3_land import RIVER, channel_profile

WATER_Z = -1.15
DEFAULT_FILM = 1.62  # WATER_HALF_WIDTH 5.40 * WATER_WIDTH_SCALE 0.30
HERO_X_MIN = -12.0
HERO_X_MAX = 8.0

BIOME_ORDER = (
    "bed",
    "underwater",
    "wet_shelf",
    "gravel",
    "damp",
    "eroded",
    "dry_soil",
    "root_grass",
    "meadow",
)

# Irregular south-bank events. Positive emerge = bank retreats (bay).
# (x, radius_m, kind, emerge_m, rise_boost)
HERO_BANK_EVENTS = (
    (-10.70, 1.18, "bank_retreat", 0.82, 0.10),
    (-7.85, 1.52, "soil_bay", 1.78, 0.06),
    (-5.05, 0.92, "rock_projection", -0.98, 0.34),
    (-2.15, 1.12, "gravel_tongue", 0.68, 0.04),
    (0.95, 0.86, "grass_point", -1.18, 0.28),
    (3.55, 1.28, "wet_pocket", 1.22, 0.02),
    (6.35, 1.08, "runoff_cut", 1.58, -0.08),
)


@dataclass
class RiverbankControls:
    """Reusable knobs. Not a huge UI — just a stable control surface."""

    channel_width: float = DEFAULT_FILM
    channel_depth: float = 0.36
    bank_steepness: float = 1.0
    left_right_asymmetry: float = 0.22
    erosion_intensity: float = 1.0
    wet_shelf_width: float = 0.58
    gravel_bar_width: float = 0.94
    soil_exposure: float = 1.0
    rock_density: float = 1.0
    rock_burial: float = 0.18
    vegetation_retreat: float = 1.0
    vegetation_overhang: float = 0.22
    small_bay_gain: float = 1.0
    inlet_gain: float = 1.0
    runoff_cut_gain: float = 1.0
    bank_height: float = 1.54
    creek_bed_depth: float = 0.36


DEFAULT_CONTROLS = RiverbankControls()


def _gaussian(value: float, center: float, radius: float) -> float:
    return math.exp(-((value - center) / max(radius, 1e-6)) ** 2)


def _smooth(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def _meadow_roll(x: float, y: float) -> float:
    """Broad landform only. No high-frequency potato field."""
    return (
        0.15 * math.sin(x * 0.10 + 0.35)
        + 0.10 * math.sin(y * 0.07 + 1.05)
        + 0.06 * math.sin((x + y) * 0.045)
    )


def _bed_pools(x: float, y: float) -> float:
    """Two wide depth variations. Visible bed, not a uniform trough."""
    a = 0.10 * _gaussian(x, -6.4, 3.4) * _gaussian(y, -11.8, 2.8)
    b = 0.08 * _gaussian(x, 2.2, 2.9) * _gaussian(y, -10.4, 2.4)
    return a + b


def hero_event(x: float, controls: RiverbankControls | None = None) -> dict:
    cfg = controls or DEFAULT_CONTROLS
    empty = {"kind": "none", "emerge": 0.0, "rise": 0.0, "weight": 0.0}
    if x < HERO_X_MIN or x > HERO_X_MAX:
        return empty
    weight_sum = 0.0
    emerge = 0.0
    rise = 0.0
    best_kind = "none"
    best_w = 0.0
    for cx, radius, kind, em, rs in HERO_BANK_EVENTS:
        ww = _gaussian(x, cx, radius)
        gain = 1.0
        if kind == "soil_bay":
            gain = cfg.small_bay_gain
        elif kind == "wet_pocket":
            gain = cfg.inlet_gain
        elif kind == "runoff_cut":
            gain = cfg.runoff_cut_gain
        emerge += em * ww * gain * cfg.erosion_intensity
        rise += rs * ww
        weight_sum += ww
        if ww > best_w:
            best_w = ww
            best_kind = kind
    if weight_sum < 0.05:
        return empty
    inv = 1.0 / weight_sum
    return {
        "kind": best_kind,
        "emerge": max(-1.35, min(2.05, emerge * inv)),
        "rise": rise * inv,
        "weight": min(1.0, best_w),
    }


def shoreline_distance(x: float, controls: RiverbankControls | None = None, south: bool = True) -> float:
    """Metres from channel centerline to TERRAIN ∩ WATER."""
    cfg = controls or DEFAULT_CONTROLS
    film = cfg.channel_width
    event = hero_event(x, cfg) if south else {"emerge": 0.0, "kind": "none"}
    emerge = film * 0.70 + float(event["emerge"]) * 0.62
    if not south:
        emerge = film * (0.78 + 0.5 * cfg.left_right_asymmetry)
    # Stay inside the locked water film so the mesh edge is not a second shore.
    emerge = min(emerge, film - 0.38)
    return max(film * 0.24, emerge)


def _south_profile(dist: float, emerge: float, event: dict, meadow_z: float, cfg: RiverbankControls) -> tuple[float, str]:
    depth = max(cfg.channel_depth, cfg.creek_bed_depth)
    bed_z = WATER_Z - depth
    steep = max(0.65, cfg.bank_steepness)
    if dist < emerge:
        t = dist / max(emerge, 1e-4)
        z = bed_z + (WATER_Z - bed_z) * (t ** (1.12 * steep))
        if t < 0.38:
            return z, "bed"
        if t < 0.70:
            return z, "underwater"
        return z, "wet_shelf"

    along = dist - emerge
    wet = cfg.wet_shelf_width * (1.35 if event["kind"] == "wet_pocket" else 1.0)
    gravel = cfg.gravel_bar_width * (1.45 if event["kind"] == "gravel_tongue" else 1.0)
    if event["kind"] == "runoff_cut":
        wet *= 0.72
        gravel *= 0.80
    soil = 1.15 * cfg.soil_exposure
    root = 0.85 * cfg.vegetation_retreat
    if event["kind"] == "grass_point":
        root *= 0.45
        soil *= 0.55
    if event["kind"] == "soil_bay":
        soil *= 1.35
        root *= 1.20

    shelf_h = WATER_Z + 0.03 + 0.10 * max(0.0, event["rise"])
    if along <= wet:
        t = _smooth(along / max(wet, 1e-4))
        return shelf_h + 0.04 * t, "wet_shelf"
    along -= wet
    gravel_h = shelf_h + 0.10
    if along <= gravel:
        t = _smooth(along / max(gravel, 1e-4))
        return gravel_h * (1.0 - t) + (gravel_h + 0.16) * t, "gravel"
    along -= gravel
    damp_run = 0.70
    damp_h = gravel_h + 0.16
    if along <= damp_run:
        t = _smooth(along / damp_run)
        return damp_h + 0.18 * t, "damp"
    along -= damp_run
    eroded_run = 0.85 * cfg.erosion_intensity
    eroded_h = damp_h + 0.18
    if along <= eroded_run:
        t = _smooth(along / max(eroded_run, 1e-4))
        z = eroded_h + (0.22 + 0.08 * event["rise"]) * t
        if event["kind"] == "runoff_cut":
            z -= 0.14 * (1.0 - t) * event["weight"]
        return z, "eroded"
    along -= eroded_run
    if along <= soil:
        t = _smooth(along / max(soil, 1e-4))
        start = eroded_h + 0.22
        return start + (meadow_z - 0.18 - start) * t, "dry_soil"
    along -= soil
    if along <= root:
        t = _smooth(along / max(root, 1e-4))
        start = meadow_z - 0.18
        overhang = -0.04 * cfg.vegetation_overhang if event["kind"] == "grass_point" else 0.0
        return start + (meadow_z - start) * t + overhang, "root_grass"
    return meadow_z, "meadow"


def _north_profile(dist: float, emerge: float, meadow_z: float, cfg: RiverbankControls) -> tuple[float, str]:
    depth = max(cfg.channel_depth, cfg.creek_bed_depth)
    bed_z = WATER_Z - depth
    if dist < emerge:
        t = dist / max(emerge, 1e-4)
        z = bed_z + (WATER_Z - bed_z) * (t ** 1.05)
        return z, "bed" if t < 0.55 else "underwater"
    along = dist - emerge
    if along < 0.90:
        t = _smooth(along / 0.90)
        return WATER_Z + 0.04 + 0.20 * t, "gravel"
    if along < 2.20:
        t = _smooth((along - 0.90) / 1.30)
        return WATER_Z + 0.24 + (meadow_z - WATER_Z - 0.24) * t, "damp"
    return meadow_z, "meadow"


def riverbank_sample(
    x: float,
    y: float,
    controls: RiverbankControls | None = None,
) -> tuple[float, str]:
    """Return (height, biome) for one continuous terrain system."""
    cfg = controls or DEFAULT_CONTROLS
    dist, signed = channel_profile(x, y)
    south = signed < 0.0
    meadow_z = WATER_Z + cfg.bank_height + _meadow_roll(x, y)
    path = abs((x + 6.2) * 0.55 + (y + 4.0) * 0.84)
    if path < 1.20 and dist > cfg.channel_width + 1.4:
        meadow_z -= 0.14 * (1.0 - path / 1.20)

    event = hero_event(x, cfg) if south else {"kind": "none", "emerge": 0.0, "rise": 0.0, "weight": 0.0}
    emerge = shoreline_distance(x, cfg, south=south)

    if south:
        z, biome = _south_profile(dist, emerge, event, meadow_z, cfg)
        if event["kind"] == "rock_projection" and abs(dist - emerge) < 1.4:
            z += 0.22 * event["weight"] * _gaussian(dist, emerge + 0.35, 0.70)
    else:
        z, biome = _north_profile(dist, emerge, meadow_z, cfg)

    if dist < emerge:
        z -= _bed_pools(x, y)

    # No landward cavity: once past the water intersection, stay above water.
    if dist >= emerge:
        z = max(z, WATER_Z + 0.02)
    return z, biome


def biome_index(name: str) -> int:
    try:
        return BIOME_ORDER.index(name)
    except ValueError:
        return len(BIOME_ORDER) - 1


def worn_path(x: float, y: float) -> bool:
    path = abs((x + 6.2) * 0.55 + (y + 4.0) * 0.84)
    dist, _ = channel_profile(x, y)
    return path < 1.15 and dist > DEFAULT_FILM + 1.2


def point_on_south_shore(x: float, controls: RiverbankControls | None = None, offset: float = 0.0) -> tuple[float, float]:
    """World XY on the camera-side bank. offset>0 is landward, <0 is toward/into water."""
    emerge = shoreline_distance(x, controls, south=True) + offset
    best = (x, -16.0)
    best_err = 1e9
    y = -24.0
    while y <= 2.0:
        dist, signed = channel_profile(x, y)
        if signed < 0.0:
            err = abs(dist - emerge)
            if err < best_err:
                best_err = err
                best = (x, y)
        y += 0.08
    return best


def rock_slots(controls: RiverbankControls | None = None) -> tuple[tuple[float, float, float, float, str], ...]:
    """Creek-scale rocks on the real TERRAIN ∩ WATER line. (x, y, scale, bury, role)."""
    cfg = controls or DEFAULT_CONTROLS
    bury = cfg.rock_burial
    density = cfg.rock_density
    if density <= 0.0:
        return ()
    plan = (
        (-7.85, -0.05, 0.95, bury + 0.10, "waterline"),
        (-5.05, 0.18, 1.15, bury + 0.14, "projection"),
        (-2.15, 0.35, 0.72, bury + 0.08, "soil"),
        (0.95, -0.08, 0.80, bury + 0.12, "waterline"),
        (3.55, 0.40, 0.58, bury + 0.06, "soil"),
        (-4.20, -0.55, 0.48, bury + 0.20, "underwater"),
        (-1.10, -0.70, 0.42, bury + 0.22, "underwater"),
        (2.10, -0.45, 0.36, bury + 0.16, "bed"),
        (-10.70, 0.55, 0.70, bury + 0.10, "vegetated"),
        (6.35, 0.30, 0.52, bury + 0.08, "soil"),
        (-6.60, -0.60, 0.40, bury + 0.18, "underwater"),
        (-0.40, 0.22, 0.34, bury + 0.05, "vegetated"),
    )
    slots = []
    for x, offset, scale, rock_bury, role in plan:
        px, py = point_on_south_shore(x, cfg, offset)
        slots.append((px, py, scale, rock_bury, role))
    keep = max(4, int(round(len(slots) * min(1.0, density))))
    return tuple(slots[:keep])


def controls_payload(controls: RiverbankControls | None = None) -> dict:
    cfg = controls or DEFAULT_CONTROLS
    payload = asdict(cfg)
    payload["eventCount"] = len(HERO_BANK_EVENTS)
    payload["eventKinds"] = [item[2] for item in HERO_BANK_EVENTS]
    payload["waterZ"] = WATER_Z
    payload["shoreline"] = "terrain_intersect_water"
    return payload
