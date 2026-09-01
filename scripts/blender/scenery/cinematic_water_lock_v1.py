"""Locked V5 water physics. Diagnostics may change bed/light/HDRI only."""
from __future__ import annotations

WATER_LOCK = {
    "ior": 1.33,
    "transmission": 0.80,
    "metallic": 0.0,
    "specular": 0.50,
    "prismM": 0.18,
    "volumeDensity": 0.18,
}

# V5 absorption colour. Density stays locked; colour is a listed diagnostic.
V5_VOLUME_COLOR = (0.07, 0.15, 0.12, 1.0)

WATER_TESTS = {
    "A": {
        "name": "WATER_TEST_A",
        "note": "more readable bed — brighter silt, shallower selected pockets",
        "bedAlbedo": (0.36, 0.28, 0.18),
        "bedRoughness": 0.70,
        "bedDepth": 0.20,
        "volumeColor": (0.18, 0.32, 0.26, 1.0),
        "hdriRotZ": 0.48,
        "sunEulerDeg": (48.0, 8.0, 28.0),
        "sunEnergy": 3.40,
        "treeFoil": False,
        "normalStrength": 0.14,
    },
    "B": {
        "name": "WATER_TEST_B",
        "note": "better sky/tree reflection — HDRI + far-bank foil, V5 bed",
        "bedAlbedo": (0.16, 0.12, 0.08),
        "bedRoughness": 0.82,
        "bedDepth": 0.36,
        "volumeColor": V5_VOLUME_COLOR,
        "hdriRotZ": 1.72,
        "sunEulerDeg": (38.0, 14.0, 54.0),
        "sunEnergy": 4.10,
        "treeFoil": True,
        "normalStrength": 0.20,
    },
    "C": {
        "name": "WATER_TEST_C",
        "note": "balanced cinematic creek — selected bed + moderate reflection",
        "bedAlbedo": (0.26, 0.20, 0.13),
        "bedRoughness": 0.74,
        "bedDepth": 0.26,
        "volumeColor": (0.12, 0.24, 0.20, 1.0),
        "hdriRotZ": 0.96,
        "sunEulerDeg": (44.0, 10.0, 32.0),
        "sunEnergy": 3.25,
        "treeFoil": True,
        "normalStrength": 0.16,
    },
}


def assert_lock(cfg: dict) -> None:
    for key, value in WATER_LOCK.items():
        if cfg.get(key) != value:
            raise AssertionError(f"water lock broken: {key}={cfg.get(key)} expected {value}")


def test_cfg(name: str) -> dict:
    if name not in WATER_TESTS:
        raise KeyError(name)
    return {**WATER_LOCK, **WATER_TESTS[name]}
