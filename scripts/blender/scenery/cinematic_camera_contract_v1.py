"""Canonical six-shot + Camera C lock. No invented transforms. No Blender."""
from __future__ import annotations

from cinematic_shots import (
    SHOTS,
    assert_shot_plan,
    camera_name,
    default_shot_cameras,
    frame_to_shot,
    hero_still_frames,
)
from cinematic_water_lock_v1 import WATER_LOCK

CAMERA_C = {
    "location": (2.2, -21.4, 3.40),
    "look": (-3.4, -10.2, 1.75),
    "lens": 32.0,
    "camera": "TJ_SHOT_02_CAM",
    "shot": "SHOT_02",
    "frameStart": 151,
    "frameEnd": 300,
    "heroFrame": 210,
}
V3_COMP_A = {
    "name": "TJ_V3_COMP_A",
    "location": (2.05, -21.6, 3.05),
    "look": (-3.35, -10.6, 1.45),
    "lens": 32.0,
}
FORBIDDEN_PRODUCTION_CAMERAS = (
    "TJ_V3_COMP_A",
    "TJ_V3_COMP_B",
    "TJ_V3_COMP_C",
    "TJ_V5_COMP_A",
    "TJ_V5_COMP_B",
    "TJ_V5_COMP_C",
    "TJ_V2_COMP_A",
    "TJ_V2_COMP_B",
    "TJ_V2_COMP_C",
)
FAILED_VISUAL_PROOF_DIGEST = "sha256:b176ca65f36290ead95b7e24717751a89cb6e1bb49ea0351d4934f1c3b065bf6"
WATER_VARIANT = "D"


def six_shot_cameras() -> list[dict]:
    cameras = default_shot_cameras()
    if len(cameras) != 6:
        raise ValueError("exactly six shot cameras are required")
    return cameras


def camera_c_lock() -> dict:
    shot02 = next(cam for cam in six_shot_cameras() if cam["id"] == "SHOT_02")
    start = shot02["start"]
    lock = {
        "camera": shot02["camera"],
        "location": tuple(start["location"]),
        "look": tuple(start["look"]),
        "lens": float(start["lens"]),
        "shot": "SHOT_02",
        "frameStart": 151,
        "frameEnd": 300,
        "heroFrame": 210,
    }
    if lock["camera"] != CAMERA_C["camera"]:
        raise ValueError("SHOT_02 camera is not TJ_SHOT_02_CAM")
    if lock["location"] != CAMERA_C["location"] or lock["look"] != CAMERA_C["look"] or lock["lens"] != CAMERA_C["lens"]:
        raise ValueError("Camera C start pose drifted from the lock")
    return lock


def resolve_production_camera(frame: int, *, compare_mode: str = "") -> str:
    if str(compare_mode or "").strip():
        raise ValueError("compare cameras are not part of the production six-shot contract")
    shot = frame_to_shot(frame)
    name = camera_name(shot["id"])
    if name in FORBIDDEN_PRODUCTION_CAMERAS:
        raise ValueError(f"{name} cannot be a production camera")
    return name


def resolve_stills_camera(frame: int, *, compare_mode: str = "", present_cameras: list[str] | None = None) -> str:
    name = resolve_production_camera(frame, compare_mode=compare_mode)
    present = set(present_cameras or [])
    if "TJ_V3_COMP_A" in present and name == "TJ_V3_COMP_A":
        raise ValueError("V3 Comp A cannot replace Camera C")
    if name in FORBIDDEN_PRODUCTION_CAMERAS:
        raise ValueError(f"{name} cannot replace a six-shot camera")
    return name


def timeline_assignments(start: int = 1, end: int = 900) -> list[dict]:
    rows = []
    for frame in range(start, end + 1):
        shot = frame_to_shot(frame)
        camera = resolve_production_camera(frame)
        rows.append({"frame": frame, "shot": shot["id"], "camera": camera, "start": shot["start"], "end": shot["end"]})
    if len(rows) != 900:
        raise ValueError("timeline must cover 900 frames")
    return rows


def visual_proof_camera_plan() -> list[dict]:
    heroes = hero_still_frames()
    plan = []
    for shot_id, frame in heroes.items():
        camera = resolve_production_camera(frame)
        if camera_name(shot_id) != camera:
            raise ValueError(f"{shot_id} visual-proof camera mismatch")
        plan.append({"shot": shot_id, "frame": frame, "camera": camera})
    if plan[1]["shot"] != "SHOT_02" or plan[1]["frame"] != 210 or plan[1]["camera"] != CAMERA_C["camera"]:
        raise ValueError("SHOT_02 frame 210 must use TJ_SHOT_02_CAM")
    return plan


def assert_v3_comp_a_cannot_replace_camera_c() -> None:
    present = [V3_COMP_A["name"], CAMERA_C["camera"]]
    resolved = resolve_stills_camera(210, present_cameras=present)
    if resolved != CAMERA_C["camera"]:
        raise ValueError("V3 Comp A replaced Camera C")
    if V3_COMP_A["location"] == CAMERA_C["location"]:
        raise ValueError("V3 Comp A must stay a distinct compare camera")


def assert_water_d_unchanged() -> dict:
    required = {
        "ior": 1.33,
        "transmission": 0.80,
        "metallic": 0.0,
        "specular": 0.50,
        "prismM": 0.18,
        "volumeDensity": 0.18,
    }
    for key, value in required.items():
        if WATER_LOCK[key] != value:
            raise ValueError(f"Water D lock drifted: {key}")
    return {**required, "variant": WATER_VARIANT}


def evaluate_camera_contract() -> dict:
    assert_shot_plan()
    lock = camera_c_lock()
    timeline = timeline_assignments()
    proof = visual_proof_camera_plan()
    assert_v3_comp_a_cannot_replace_camera_c()
    water = assert_water_d_unchanged()
    cameras = [cam["camera"] for cam in six_shot_cameras()]
    changes = []
    prev = None
    for row in timeline:
        if row["camera"] != prev:
            changes.append({"frame": row["frame"], "camera": row["camera"], "shot": row["shot"]})
            prev = row["camera"]
    if [row["frame"] for row in changes] != [1, 151, 301, 451, 601, 751]:
        raise ValueError("scene.camera must change at the six shot cuts")
    frame210 = next(row for row in timeline if row["frame"] == 210)
    return {
        "schema": "TIVVLEJOY_V7_CAMERA_CONTRACT_V1",
        "sixShotCameras": cameras,
        "cameraC": lock,
        "frame210": frame210,
        "visualProof": proof,
        "timelineCuts": changes,
        "water": water,
        "failedDigestIneligible": FAILED_VISUAL_PROOF_DIGEST,
        "ok": (
            frame210["camera"] == CAMERA_C["camera"]
            and lock["location"] == CAMERA_C["location"]
            and water["variant"] == "D"
            and len(cameras) == 6
        ),
    }
