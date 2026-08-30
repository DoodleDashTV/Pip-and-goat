"""TJ_SHORELINE_TRANSITION_V2 — irregular physical events, not brown bands.

V6 proved the recipe existed but objects did not occupy the rendered crop.
V2 places overlapping geometry on the real waterline and breaks the silhouette
with five different shoreline events. Widths are irregular, not parallel strips.
"""
from __future__ import annotations

from cinematic_riverbank_v1 import point_on_south_shore
from cinematic_shoreline_v1 import along_shore, transition_color

TRANSITION_WIDTH_MIN = 1.50
TRANSITION_WIDTH_MAX = 2.50

# (x, kind, landward_m, waterward_m, half_width_m)
# landward/waterward are offsets from TERRAIN ∩ WATER.
EVENTS = (
    (-6.6, "grass_overhang", 0.35, 0.22, 1.15),
    (-4.1, "soil_bay", 2.15, 0.28, 1.35),
    (-1.9, "gravel_tongue", 0.55, 0.72, 1.25),
    (0.55, "submerged_rocks", 0.85, 0.68, 1.10),
    (2.70, "fern_intrusion", 0.70, 0.18, 1.05),
    (4.90, "runoff_notch", 1.45, 0.32, 0.85),
)

EVENT_KINDS = tuple(item[1] for item in EVENTS)


def event_at(x: float) -> dict:
    best = {"kind": "none", "weight": 0.0, "land": 1.70, "water": 0.35}
    for cx, kind, land, water, half in EVENTS:
        dx = abs(x - cx)
        if dx > half * 2.2:
            continue
        w = max(0.0, 1.0 - (dx / max(half, 1e-4)) ** 2)
        if w > best["weight"]:
            best = {"kind": kind, "weight": w, "land": land, "water": water, "x": cx}
    return best


def local_width(x: float) -> float:
    ev = event_at(x)
    raw = ev["land"] + ev["water"]
    return max(TRANSITION_WIDTH_MIN, min(TRANSITION_WIDTH_MAX, raw + 0.15))


def physical_slots() -> tuple[tuple[float, float, str, float, str], ...]:
    """Dense (x, y, cue, scale, event) on the real waterline. Crop lives near x=-5..3."""
    plan = (
        # grass_overhang — grass almost to water
        (-7.1, 0.55, "grass_root", 0.95, "grass_overhang"),
        (-6.6, 0.18, "grass_root", 0.88, "grass_overhang"),
        (-6.2, -0.08, "grass_root", 0.72, "grass_overhang"),
        (-6.8, 0.95, "dry_soil", 0.28, "grass_overhang"),
        # soil_bay — large exposed soil
        (-4.8, 1.55, "dry_soil", 0.34, "soil_bay"),
        (-4.1, 1.10, "crumbled_soil", 0.30, "soil_bay"),
        (-3.7, 0.55, "damp_soil", 0.32, "soil_bay"),
        (-4.3, 0.12, "wet_soil", 0.28, "soil_bay"),
        (-3.9, -0.18, "fine_gravel", 0.22, "soil_bay"),
        # gravel_tongue — gravel reaches water
        (-2.4, 0.85, "fine_gravel", 0.26, "gravel_tongue"),
        (-1.9, 0.22, "fine_gravel", 0.24, "gravel_tongue"),
        (-1.6, -0.28, "fine_gravel", 0.20, "gravel_tongue"),
        (-2.1, -0.55, "underwater_gravel", 0.22, "gravel_tongue"),
        (-1.5, 0.48, "small_stone", 0.30, "gravel_tongue"),
        # submerged rock group
        (0.2, 0.35, "medium_stone", 0.48, "submerged_rocks"),
        (0.55, -0.12, "medium_stone", 0.42, "submerged_rocks"),
        (0.85, -0.42, "submerged_stone", 0.38, "submerged_rocks"),
        (0.35, -0.70, "underwater_gravel", 0.24, "submerged_rocks"),
        (1.05, 0.70, "small_stone", 0.28, "submerged_rocks"),
        # fern intrusion
        (2.40, 0.62, "fern", 0.82, "fern_intrusion"),
        (2.80, 0.28, "fern", 0.70, "fern_intrusion"),
        (2.55, 1.05, "grass_root", 0.78, "fern_intrusion"),
        (3.00, -0.08, "small_stone", 0.26, "fern_intrusion"),
        # runoff notch
        (4.70, 0.90, "damp_soil", 0.30, "runoff_notch"),
        (5.00, 0.20, "wet_soil", 0.26, "runoff_notch"),
        (5.20, -0.22, "fine_gravel", 0.20, "runoff_notch"),
        # extra mixed stones so the crop is occupied, not a brown strip
        (-5.4, 0.40, "small_stone", 0.28, "grass_overhang"),
        (-3.2, -0.38, "submerged_stone", 0.34, "soil_bay"),
        (-0.6, 0.18, "small_stone", 0.26, "gravel_tongue"),
        (1.60, -0.30, "submerged_stone", 0.32, "submerged_rocks"),
        (-2.8, 1.25, "dry_soil", 0.26, "soil_bay"),
        (1.90, 1.40, "grass_root", 0.80, "fern_intrusion"),
    )
    slots = []
    for x, offset, cue, scale, ev in plan:
        px, py = point_on_south_shore(x, offset=offset)
        slots.append((px, py, cue, scale, ev))
    return tuple(slots)


def gravel_scatter_plan(x_center: float = -2.0, count: int = 48) -> list[tuple[float, float, float, bool]]:
    """Irregular 2–8 cm gravel. (x, y, radius, wet)."""
    import math

    out = []
    for i in range(count):
        ev = EVENTS[i % len(EVENTS)]
        x = ev[0] + 0.55 * math.sin(i * 1.71 + 0.3)
        along = -0.65 + (1.85 * ((i * 37) % 11) / 10.0)
        if ev[1] == "grass_overhang":
            along = max(along, 0.05)
        if ev[1] == "gravel_tongue":
            along = min(along, 0.55)
        px, py = point_on_south_shore(x, offset=along)
        radius = 0.025 + 0.022 * ((i * 13) % 7) / 6.0
        out.append((px, py, radius, along < 0.20))
    return out


def occupation_ok(slots: tuple | None = None) -> bool:
    slots = slots if slots is not None else physical_slots()
    kinds = {s[4] for s in slots}
    required = {"grass_overhang", "soil_bay", "gravel_tongue", "submerged_rocks", "fern_intrusion"}
    return required <= kinds and len(slots) >= 28


def shoreline_v2_payload() -> dict:
    slots = physical_slots()
    return {
        "system": "TJ_SHORELINE_TRANSITION_V2",
        "eventKinds": list(EVENT_KINDS),
        "eventCount": len(EVENTS),
        "slotCount": len(slots),
        "widthMin": TRANSITION_WIDTH_MIN,
        "widthMax": TRANSITION_WIDTH_MAX,
        "occupationOk": occupation_ok(slots),
        "notParallelBands": True,
    }
