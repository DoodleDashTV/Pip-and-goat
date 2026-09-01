"""TJ_MEADOW_SYSTEM_V1 — ecological zones for Botaniq + GeoScatter recipes.

No Blender import. GeoScatter addon is not enabled; meadow layer names from
owned grass_biome_01/02 inform density and species roles only.
"""
from __future__ import annotations

import math

from cinematic_hero_v3_land import channel_profile
from cinematic_riverbank_v1 import DEFAULT_FILM, riverbank_sample, worn_path

ZONES = (
    "short_grass",
    "medium_meadow",
    "tall_pocket",
    "bare_earth",
    "forest_litter",
    "fern_shrub",
    "rocky_sparse",
    "worn_open",
)

# Owned GeoScatter presets. Addon stays off; we implement the scatter.
GEOSCATTER_PRESETS = (
    "Meadows/grass_biome_01",
    "Meadows/grass_biome_02",
)

# Camera C neighbourhood — highest instance density.
CAMERA_XY = (2.05, -21.6)


def _gaussian(value: float, center: float, radius: float) -> float:
    return math.exp(-((value - center) / max(radius, 1e-6)) ** 2)


def camera_distance(x: float, y: float) -> float:
    return math.hypot(x - CAMERA_XY[0], y - CAMERA_XY[1])


def meadow_zone(x: float, y: float) -> str:
    """Winner-take-all ecological region. Physical, not a shader tint."""
    dist, signed = channel_profile(x, y)
    _z, bank = riverbank_sample(x, y)
    if worn_path(x, y):
        return "worn_open"
    if bank in {"bed", "underwater", "wet_shelf", "gravel"}:
        return "rocky_sparse" if bank == "gravel" else "bare_earth"
    if bank in {"damp", "eroded", "dry_soil"}:
        if _gaussian(x, -5.0, 1.1) > 0.55:
            return "rocky_sparse"
        return "bare_earth" if bank != "damp" else "short_grass"
    forest = _gaussian(x, -15.5, 4.2) * _gaussian(y, -8.5, 5.0)
    forest += 0.65 * _gaussian(x, 9.2, 3.6) * _gaussian(y, -6.5, 4.2)
    if forest > 0.42:
        return "forest_litter" if forest > 0.70 else "fern_shrub"
    tall = max(
        _gaussian(x, -9.8, 2.2) * _gaussian(y, -8.0, 2.4),
        _gaussian(x, 4.6, 1.8) * _gaussian(y, -6.8, 2.0),
        _gaussian(x, -1.2, 1.6) * _gaussian(y, -4.5, 1.8),
    )
    if tall > 0.48 and dist > DEFAULT_FILM + 2.4:
        return "tall_pocket"
    if signed < 0 and dist < DEFAULT_FILM + 3.6:
        return "short_grass"
    if camera_distance(x, y) < 6.5:
        return "short_grass"
    if _gaussian(x, -6.0, 2.8) * _gaussian(y, -2.5, 2.2) > 0.40:
        return "bare_earth"
    return "medium_meadow"


def scatter_density(zone: str, x: float, y: float) -> float:
    """Instances per square metre. High near Camera C, thinner with distance."""
    base = {
        "short_grass": 3.4,
        "medium_meadow": 2.2,
        "tall_pocket": 1.4,
        "bare_earth": 0.15,
        "forest_litter": 0.55,
        "fern_shrub": 0.85,
        "rocky_sparse": 0.35,
        "worn_open": 0.08,
    }[zone]
    dist = camera_distance(x, y)
    if dist < 8.0:
        falloff = 1.0
    elif dist < 16.0:
        falloff = 0.62
    elif dist < 26.0:
        falloff = 0.32
    else:
        falloff = 0.16
    # Never collapse to a smooth green carrier in the readable midground.
    if zone in {"short_grass", "medium_meadow", "tall_pocket"} and dist < 22.0:
        falloff = max(falloff, 0.28)
    return base * falloff


def species_for_zone(zone: str) -> tuple[str, ...]:
    """Owned Botaniq stand-ins for GeoScatter meadow layers."""
    return {
        "short_grass": ("carex_a", "festuca_a"),
        "medium_meadow": ("carex_b", "festuca_b", "carex_a"),
        "tall_pocket": ("carex_b", "hazel_a"),
        "bare_earth": ("festuca_a",),
        "forest_litter": ("fern_a", "moss_a", "hazel_b"),
        "fern_shrub": ("fern_b", "fern_d", "hazel_a"),
        "rocky_sparse": ("festuca_a", "moss_b", "fern_a"),
        "worn_open": ("festuca_a",),
    }[zone]


def meadow_scatter_plan(bounds: tuple[float, float, float, float], step: float = 1.15) -> list[dict]:
    """Deterministic clump list. Negative space is empty cells, not a tint."""
    x0, x1, y0, y1 = bounds
    planted = []
    iy = 0
    y = y0
    while y <= y1:
        ix = 0
        x = x0 + (0.35 if iy % 2 else 0.0)
        while x <= x1:
            zone = meadow_zone(x, y)
            density = scatter_density(zone, x, y)
            keep = density * (step * step) >= 0.55
            # Force a few negative-space cells even in grassy zones.
            if (ix + 3 * iy) % 7 == 0 and zone in {"medium_meadow", "short_grass"}:
                keep = False
                zone = "bare_earth"
            if keep:
                species = species_for_zone(zone)
                planted.append(
                    {
                        "x": round(x, 3),
                        "y": round(y, 3),
                        "zone": zone,
                        "species": species[(ix + iy) % len(species)],
                        "density": round(density, 3),
                    }
                )
            ix += 1
            x += step
        iy += 1
        y += step * 0.92
    return planted


def meadow_payload(plan: list[dict] | None = None) -> dict:
    plan = plan if plan is not None else meadow_scatter_plan((-14.0, 9.0, -22.0, 4.0), 1.35)
    zones = {item["zone"] for item in plan}
    return {
        "system": "TJ_MEADOW_SYSTEM_V1",
        "geoscatterAddonEnabled": False,
        "geoscatterPresets": list(GEOSCATTER_PRESETS),
        "geoscatterUsage": "layer_recipe_only",
        "zones": list(ZONES),
        "zonesPresent": sorted(zones),
        "clumpCount": len(plan),
        "negativeSpace": any(item["zone"] in {"bare_earth", "worn_open", "rocky_sparse"} for item in plan),
        "botaniqAssets": (
            "bq_Grass_Carex-oshimensis_A/B",
            "bq_Grass_Festuca_glauca_A/B",
            "bq_Shrub_Corylus-avellana_A/B",
            "bq_Plant_Dryopteris-carthusiana_A/B/D",
            "bq_Moss_Rhytidiadelphus_A/B",
        ),
    }
