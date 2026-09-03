"""Deterministic hero / mid / background vegetation tiers."""

from __future__ import annotations

FEATURE = "forest_vegetation_tiers_v1"
HERO_Y_MAX = 8.0
MID_Y_MAX = 18.0


def classify_tier(y: float, projected_px: float | None = None) -> str:
    if projected_px is not None and projected_px >= 90:
        return "hero"
    if y < HERO_Y_MAX:
        return "hero"
    if y < MID_Y_MAX:
        return "midground"
    return "background"


def eco_kit_allowed(tier: str) -> bool:
    return tier == "background"


def required_source(tier: str, role: str) -> str:
    if role == "bark":
        return "botaniq_tilia"
    if tier == "background":
        return "ecokit_or_botaniq"
    return {
        "shrub": "botaniq_corylus_shrub",
        "grass": "botaniq_carex",
        "fern": "botaniq_dryopteris",
        "leaf": "botaniq_corylus_leaf",
        "ground": "botaniq_soil_litter_moss",
    }.get(role, "owned_strongest")
