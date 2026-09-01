#!/usr/bin/env python3
"""Fail-closed Camera C / six-shot contract tests. No paid GPU. No invented poses."""
from __future__ import annotations

from pathlib import Path

from cinematic_camera_contract_v1 import (
    CAMERA_C,
    FAILED_VISUAL_PROOF_DIGEST,
    FORBIDDEN_PRODUCTION_CAMERAS,
    V3_COMP_A,
    assert_v3_comp_a_cannot_replace_camera_c,
    assert_water_d_unchanged,
    camera_c_lock,
    evaluate_camera_contract,
    resolve_production_camera,
    resolve_stills_camera,
    six_shot_cameras,
    timeline_assignments,
    visual_proof_camera_plan,
)
from cinematic_shots import camera_name, frame_to_shot, hero_still_frames
from cinematic_water_lock_v1 import WATER_LOCK

HERE = Path(__file__).resolve().parent


def _repo_root() -> Path:
    candidates = (
        HERE.parents[2],
        Path("/opt/ddp-worker"),
        Path("/workspace"),
    )
    markers = (
        "workers/runpod-blender/src/visual-proof-contract-v1.js",
        "src/visual-proof-contract-v1.js",
    )
    for root in candidates:
        for marker in markers:
            if (root / marker).is_file():
                return root
    return HERE.parents[2]


REPO = _repo_root()


def _js(name: str) -> Path:
    for path in (
        REPO / "workers/runpod-blender/src" / name,
        REPO / "src" / name,
        Path("/opt/ddp-worker/src") / name,
    ):
        if path.is_file():
            return path
    raise FileNotFoundError(name)


def test_six_approved_shot_cameras() -> None:
    cameras = six_shot_cameras()
    assert [cam["id"] for cam in cameras] == [f"SHOT_0{i}" for i in range(1, 7)]
    assert [cam["camera"] for cam in cameras] == [f"TJ_SHOT_0{i}_CAM" for i in range(1, 7)]


def test_shot_frame_ranges_and_assignments() -> None:
    expected = {
        "SHOT_01": (1, 150, "TJ_SHOT_01_CAM"),
        "SHOT_02": (151, 300, "TJ_SHOT_02_CAM"),
        "SHOT_03": (301, 450, "TJ_SHOT_03_CAM"),
        "SHOT_04": (451, 600, "TJ_SHOT_04_CAM"),
        "SHOT_05": (601, 750, "TJ_SHOT_05_CAM"),
        "SHOT_06": (751, 900, "TJ_SHOT_06_CAM"),
    }
    for shot_id, (start, end, camera) in expected.items():
        assert frame_to_shot(start)["id"] == shot_id
        assert frame_to_shot(end)["id"] == shot_id
        assert resolve_production_camera(start) == camera
        assert resolve_production_camera(end) == camera
        assert camera_name(shot_id) == camera


def test_timeline_camera_changes_at_cuts() -> None:
    rows = timeline_assignments()
    assert len(rows) == 900
    assert rows[0]["camera"] == "TJ_SHOT_01_CAM"
    assert rows[149]["camera"] == "TJ_SHOT_01_CAM"
    assert rows[150]["camera"] == "TJ_SHOT_02_CAM"
    assert rows[209]["camera"] == "TJ_SHOT_02_CAM"
    assert rows[300]["camera"] == "TJ_SHOT_03_CAM"
    assert rows[899]["camera"] == "TJ_SHOT_06_CAM"
    cuts = [row["frame"] for row in rows if row["frame"] == 1 or rows[row["frame"] - 2]["camera"] != row["camera"]]
    assert cuts == [1, 151, 301, 451, 601, 751]


def test_camera_c_lock_exact() -> None:
    lock = camera_c_lock()
    assert lock["location"] == (2.2, -21.4, 3.40)
    assert lock["look"] == (-3.4, -10.2, 1.75)
    assert lock["lens"] == 32.0
    assert lock["camera"] == "TJ_SHOT_02_CAM"
    assert CAMERA_C["location"] == lock["location"]


def test_frame_210_uses_shot_02_camera() -> None:
    assert frame_to_shot(210)["id"] == "SHOT_02"
    assert resolve_production_camera(210) == "TJ_SHOT_02_CAM"
    assert hero_still_frames()["SHOT_02"] == 210
    plan = visual_proof_camera_plan()
    hero = next(row for row in plan if row["shot"] == "SHOT_02")
    assert hero == {"shot": "SHOT_02", "frame": 210, "camera": "TJ_SHOT_02_CAM"}


def test_v3_comp_a_cannot_replace_camera_c() -> None:
    assert_v3_comp_a_cannot_replace_camera_c()
    assert resolve_stills_camera(210, present_cameras=["TJ_V3_COMP_A", "TJ_SHOT_02_CAM"]) == "TJ_SHOT_02_CAM"
    assert V3_COMP_A["location"] != CAMERA_C["location"]
    try:
        resolve_production_camera(210, compare_mode="comps")
        raise AssertionError("compare mode must not resolve a production camera")
    except ValueError as exc:
        assert "compare" in str(exc)


def test_water_d_unchanged() -> None:
    water = assert_water_d_unchanged()
    assert water["variant"] == "D"
    assert WATER_LOCK["ior"] == 1.33
    assert WATER_LOCK["transmission"] == 0.80
    assert WATER_LOCK["volumeDensity"] == 0.18
    valley = (HERE / "cinematic_valley_world_v1.py").read_text()
    assert '"label": "D"' in valley
    assert '"trans": 0.80' in valley
    assert '"volume_density": 0.18' in valley
    assert "WATER_WIDTH_SCALE = 0.30" in valley
    assert "BED_WIDTH_SCALE = 0.68" in valley
    assert "HDRI_REFLECTION_ROTATION_Z = 0.48" in valley


def test_visual_proof_uses_same_cameras_as_final() -> None:
    proof = visual_proof_camera_plan()
    final = {row["shot"]: row["camera"] for row in timeline_assignments() if row["frame"] in {48, 210, 360, 520, 680, 860}}
    assert {row["shot"]: row["camera"] for row in proof} == final
    js = _js("visual-proof-contract-v1.js").read_text()
    assert "TJ_SHOT_02_CAM" in js
    assert "--v3-camera" in js and "V3_CAMERA_FORBIDDEN" in js
    assert "water-variant D" in js


def test_stills_path_no_longer_hijacks_v3_comp_a() -> None:
    valley = (HERE / "cinematic_valley_world_v1.py").read_text()
    hero = (HERE / "cinematic_hero_rebuild_v3.py").read_text()
    assert "resolve_production_camera" in valley
    assert "v3_cam = bpy.data.objects.get(v3_spec[\"name\"])" not in valley
    assert "bpy.context.scene.camera = v3_cam" not in valley
    assert "install_compare_cameras" in hero
    assert "setup_comp_cameras() if install_compare_cameras else []" in hero
    stills_idx = valley.index("if args.stills_only")
    stills = valley[stills_idx:stills_idx + 1800]
    assert "set_active_camera_for_frame(frame)" in stills
    assert "v3_cam" not in stills
    assert "PRODUCTION_CAMERA_REPLACED_BY_V3_COMP" in stills
    assert "STILLS_CAMERA_NOT_SIX_SHOT" in stills


def test_worker_entry_does_not_launch_forbidden_cmds() -> None:
    entry = _js("scenery-showcase-original14-entry.js").read_text()
    assert "scenery-showcase-original14.js" in entry
    assert "scenery-showcase-entry-v2.js" not in entry
    assert "v7-proof-a-boot.js" not in entry
    assert FAILED_VISUAL_PROOF_DIGEST.startswith("sha256:")


def test_evaluate_ok() -> None:
    row = evaluate_camera_contract()
    assert row["ok"] is True
    assert row["frame210"]["camera"] == "TJ_SHOT_02_CAM"
    assert row["failedDigestIneligible"] == FAILED_VISUAL_PROOF_DIGEST
    assert all(name not in FORBIDDEN_PRODUCTION_CAMERAS for name in row["sixShotCameras"])


if __name__ == "__main__":
    test_six_approved_shot_cameras()
    test_shot_frame_ranges_and_assignments()
    test_timeline_camera_changes_at_cuts()
    test_camera_c_lock_exact()
    test_frame_210_uses_shot_02_camera()
    test_v3_comp_a_cannot_replace_camera_c()
    test_water_d_unchanged()
    test_visual_proof_uses_same_cameras_as_final()
    test_stills_path_no_longer_hijacks_v3_comp_a()
    test_worker_entry_does_not_launch_forbidden_cmds()
    test_evaluate_ok()
    print("cinematic_camera_contract_v1_test PASS")
