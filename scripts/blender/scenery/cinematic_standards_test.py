#!/usr/bin/env python3
"""Deterministic cinematic pipeline contract tests."""
from __future__ import annotations

from cinematic_shots import (
    SHOTS,
    assert_shot_plan,
    camera_name,
    default_shot_cameras,
    frame_to_shot,
    hero_search_cameras,
    lookdev_frames,
    marker_frames,
    shot_standard_payload,
)
from cinematic_standards import (
    AUTOMATIC_VISUAL_FAILURES,
    FINAL_NATIVE_RESOLUTION,
    MASTER_COLLECTIONS,
    PROFILES,
    assert_final_contract,
    assert_no_proof_quality_in_final,
    ffmpeg_final_args,
    ffmpeg_has_upscale,
    is_final_profile,
    normalize_profile,
    profile_defaults,
    require_visual_approval_before_paid_final,
    visible_use_record,
)


def test_profiles_are_separated():
    assert PROFILES == ("BLOCKOUT", "LOOKDEV_FAST", "HERO_STILL", "FINAL")
    assert is_final_profile("final") is True
    assert is_final_profile("LOOKDEV_FAST") is False
    lookdev = profile_defaults("LOOKDEV_FAST")
    assert lookdev["canLabelFinal"] is False
    assert lookdev["resolution"] in {"540x960", "720x1280"}
    final = profile_defaults("FINAL")
    assert final["resolution"] == FINAL_NATIVE_RESOLUTION
    assert final["allowUpscale"] is False
    assert final["imageSequenceRequired"] is True
    assert final["cyclesDevice"] == "GPU"
    assert final["denoise"] is True


def test_final_rejects_upscale_and_540():
    try:
        assert_final_contract({"profile": "FINAL", "resolution": "540x960", "allowUpscale": True, "upscaleFilter": "lanczos"})
        raise AssertionError("540 FINAL should fail")
    except ValueError as exc:
        assert "1080x1920" in str(exc) or "upscale" in str(exc)
    try:
        assert_final_contract({"profile": "LOOKDEV_FAST", "canLabelFinal": True, "label": "FINAL_1080P"})
        raise AssertionError("lookdev labeled FINAL should fail")
    except ValueError:
        pass
    assert_final_contract(profile_defaults("FINAL"))


def test_final_ffmpeg_has_no_scale_filter():
    args = ffmpeg_final_args()
    assert ffmpeg_has_upscale(args) is False
    assert ffmpeg_has_upscale(["-vf", "scale=1080:1920:flags=lanczos"]) is True


def test_lookdev_cannot_be_final_even_if_encoded():
    config = profile_defaults("LOOKDEV_FAST")
    config["label"] = "FINAL"
    try:
        assert_final_contract(config)
        raise AssertionError("expected lookdev FINAL label to fail")
    except ValueError:
        pass


def test_cycles_cpu_force_fails_final():
    config = profile_defaults("FINAL")
    config["cyclesDevice"] = "CPU"
    try:
        assert_final_contract(config)
        raise AssertionError("forced CPU FINAL should fail")
    except ValueError as exc:
        assert "CPU" in str(exc)


def test_proof_quality_flags_fail_final():
    try:
        assert_no_proof_quality_in_final({"lanczos_upscale_to_1080": True, "target_faces_per_mesh_8000": True})
        raise AssertionError("proof flags should fail")
    except ValueError as exc:
        assert "lanczos_upscale_to_1080" in str(exc)


def test_six_shot_plan():
    assert_shot_plan()
    assert marker_frames() == [1, 151, 301, 451, 601, 751]
    assert frame_to_shot(1)["id"] == "SHOT_01"
    assert frame_to_shot(210)["id"] == "SHOT_02"
    assert frame_to_shot(900)["id"] == "SHOT_06"
    assert camera_name("SHOT_05") == "TJ_SHOT_05_CAM"
    cameras = default_shot_cameras()
    assert len(cameras) == 6
    lenses = [cam["start"]["lens"] for cam in cameras]
    assert min(lenses) <= 28.0
    assert max(lenses) >= 70.0
    assert len(set(lenses)) >= 5
    shot05 = next(cam for cam in cameras if cam["id"] == "SHOT_05")
    assert shot05["start"]["location"][2] >= 14.0
    assert abs(shot05["start"]["location"][0]) >= 16.0
    assert shot05["start"]["look"][1] >= 40.0
    assert shot05["start"]["location"][1] <= -70.0
    assert shot05["start"]["look"][2] <= 20.0
    shot03 = next(cam for cam in cameras if cam["id"] == "SHOT_03")
    assert shot03["start"]["location"][0] <= -28.0
    assert shot03["start"]["look"][0] <= -12.0
    shot02 = next(cam for cam in cameras if cam["id"] == "SHOT_02")
    # V36 retired the V35 height lock. Hero must look north across the creek.
    assert shot02["start"]["location"][1] < -16.0
    assert shot02["start"]["look"][1] > shot02["start"]["location"][1]
    assert shot02["start"]["location"][2] < 6.0
    assert len(lookdev_frames()) == 12
    payload = shot_standard_payload()
    assert payload["cutsNotInterpolated"] is True
    assert SHOTS[4]["lensMin"] == 60.0
    heroes = hero_search_cameras()
    assert [item["id"] for item in heroes] == ["A", "B", "C", "D", "E"]
    zs = [item["location"][2] for item in heroes]
    assert max(zs) - min(zs) >= 6.0
    xs = [item["location"][0] for item in heroes]
    assert max(xs) - min(xs) >= 20.0


def test_visible_use_requires_rendered_pixels():
    loaded_only = visible_use_record("PSA", downloaded=True, extracted=True, datablockLoaded=True)
    assert loaded_only["visiblyUsed"] is False
    used = visible_use_record(
        "village_blender",
        downloaded=True,
        extracted=True,
        datablockLoaded=True,
        renderedPixels=True,
        shotIds=["SHOT_04"],
        evidence="cryptomatte:Cabin01A",
    )
    assert used["visiblyUsed"] is True


def test_visual_approval_required_before_paid_final():
    try:
        require_visual_approval_before_paid_final(None)
        raise AssertionError("missing receipt should fail")
    except ValueError:
        pass
    try:
        require_visual_approval_before_paid_final({"result": "FAIL", "humanApproved": False})
        raise AssertionError("FAIL receipt should fail")
    except ValueError:
        pass
    require_visual_approval_before_paid_final({
        "result": "PASS",
        "humanApproved": True,
        "recipeIdentity": "valley-v1",
        "authorizedRecipeIdentity": "valley-v1",
    })


def test_master_collections_and_gate_list():
    assert "WORLD_RIVER" in MASTER_COLLECTIONS
    assert "WORLD_CAMERAS" in MASTER_COLLECTIONS
    assert len(MASTER_COLLECTIONS) == 14
    assert "river_reads_as_road_path_or_blue_tape" in AUTOMATIC_VISUAL_FAILURES
    assert "upscaled_softness" in AUTOMATIC_VISUAL_FAILURES


if __name__ == "__main__":
    test_profiles_are_separated()
    test_final_rejects_upscale_and_540()
    test_final_ffmpeg_has_no_scale_filter()
    test_lookdev_cannot_be_final_even_if_encoded()
    test_cycles_cpu_force_fails_final()
    test_proof_quality_flags_fail_final()
    test_six_shot_plan()
    test_visible_use_requires_rendered_pixels()
    test_visual_approval_required_before_paid_final()
    test_master_collections_and_gate_list()
    print("cinematic_standards_test PASS")
