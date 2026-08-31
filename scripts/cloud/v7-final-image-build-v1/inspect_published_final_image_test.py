#!/usr/bin/env python3
"""Zero-cost tests for FINAL image inspect JSON extraction. No Docker. No RunPod."""
from __future__ import annotations

from inspect_published_final_image import extract_camera_contract, frame210_camera, _xyz

MIXED_BLENDER_LOG = """
Blender 4.2.2 LTS (hash c03d7d98a413 built 2024-09-24 00:09:56)
{"schema": "TIVVLEJOY_V7_CAMERA_CONTRACT_BLENDER_V1", "ok": true, "cameras": ["TJ_SHOT_01_CAM", "TJ_SHOT_02_CAM", "TJ_SHOT_03_CAM", "TJ_SHOT_04_CAM", "TJ_SHOT_05_CAM", "TJ_SHOT_06_CAM"], "frame210": "TJ_SHOT_02_CAM", "cameraC": {"location": [2.2, -21.4, 3.4], "look": [-3.4, -10.2, 1.75], "lens": 32.0}, "cuts": [{"frame": 1, "camera": "TJ_SHOT_01_CAM"}, {"frame": 151, "camera": "TJ_SHOT_02_CAM"}, {"frame": 301, "camera": "TJ_SHOT_03_CAM"}, {"frame": 451, "camera": "TJ_SHOT_04_CAM"}, {"frame": 601, "camera": "TJ_SHOT_05_CAM"}, {"frame": 751, "camera": "TJ_SHOT_06_CAM"}], "observed": [{"frame": 1, "camera": "TJ_SHOT_01_CAM"}, {"frame": 151, "camera": "TJ_SHOT_02_CAM"}, {"frame": 210, "camera": "TJ_SHOT_02_CAM"}, {"frame": 301, "camera": "TJ_SHOT_03_CAM"}, {"frame": 451, "camera": "TJ_SHOT_04_CAM"}, {"frame": 601, "camera": "TJ_SHOT_05_CAM"}, {"frame": 751, "camera": "TJ_SHOT_06_CAM"}, {"frame": 900, "camera": "TJ_SHOT_06_CAM"}], "v3CompAPresent": true, "v3CompAUsed": false}
Blender quit
"""


def test_extracts_camera_contract_from_mixed_blender_log() -> None:
    camera = extract_camera_contract(MIXED_BLENDER_LOG)
    assert camera["ok"] is True
    assert camera["cameras"] == [
        "TJ_SHOT_01_CAM",
        "TJ_SHOT_02_CAM",
        "TJ_SHOT_03_CAM",
        "TJ_SHOT_04_CAM",
        "TJ_SHOT_05_CAM",
        "TJ_SHOT_06_CAM",
    ]
    assert frame210_camera(camera) == "TJ_SHOT_02_CAM"
    assert _xyz(camera["cameraC"]["location"]) == [2.2, -21.4, 3.4]
    assert _xyz(camera["cameraC"]["look"]) == [-3.4, -10.2, 1.75]
    assert float(camera["cameraC"]["lens"]) == 32.0
    assert camera["v3CompAUsed"] is False


def test_frame210_accepts_object_or_string() -> None:
    assert frame210_camera({"frame210": "TJ_SHOT_02_CAM"}) == "TJ_SHOT_02_CAM"
    assert frame210_camera({"frame210": {"camera": "TJ_SHOT_02_CAM", "frame": 210}}) == "TJ_SHOT_02_CAM"


def test_missing_json_fails_closed() -> None:
    try:
        extract_camera_contract("Blender 4.2.2 LTS\nBlender quit\n")
    except ValueError as exc:
        assert "CAMERA_CONTRACT_JSON_MISSING" in str(exc)
    else:
        raise AssertionError("missing JSON must fail closed")


if __name__ == "__main__":
    test_extracts_camera_contract_from_mixed_blender_log()
    test_frame210_accepts_object_or_string()
    test_missing_json_fails_closed()
    print("inspect_published_final_image_test PASS")
