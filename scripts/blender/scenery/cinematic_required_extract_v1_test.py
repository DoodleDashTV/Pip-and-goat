#!/usr/bin/env python3
"""Zero-cost required-library extract tests. No Blender. No RunPod."""
from __future__ import annotations

import hashlib
import tempfile
import zipfile
from pathlib import Path

from cinematic_required_extract_v1 import (
    DOCUMENTED_FLORA_BYTES,
    DOCUMENTED_ROCK_BYTES,
    ECOKIT_ROLE,
    ECOKIT_ZIP_SHA256,
    FLORA_MEMBER,
    FLORA_NAME,
    LEGACY_BLEND_CAP,
    REQUIRED_LIBRARIES,
    ROCK_MEMBER,
    ROCK_NAME,
    RequiredLibraryError,
    apply_role_limit_keep_required,
    expected_runtime_path,
    extract_required_from_zip,
    is_required_cinematic_library,
    original14_manifest,
    required_size_ok,
    sha256_file,
    verify_required_libraries,
)
from showcase_original14_select import MAX_EXTRACT_BYTES, extract_role_limit, should_extract_member
from cinematic_shots import default_shot_cameras, hero_still_frames
from cinematic_camera_contract_v1 import CAMERA_C
from cinematic_water_lock_v1 import WATER_LOCK

HERE = Path(__file__).resolve().parent


def test_historical_180mib_cap_is_the_v3_skip():
    cap = MAX_EXTRACT_BYTES[".blend"]
    assert cap == LEGACY_BLEND_CAP == 180 * 1024 * 1024
    assert DOCUMENTED_FLORA_BYTES > cap
    assert DOCUMENTED_ROCK_BYTES > cap
    # V3 production path called should_extract_member without intake='lookdev'.
    # The historical cap returned False, so extract_selected never wrote these
    # members. require_files then failed inside already-started Blender.
    assert is_required_cinematic_library(FLORA_MEMBER) is True
    assert is_required_cinematic_library(ROCK_MEMBER) is True
    assert should_extract_member(FLORA_NAME, DOCUMENTED_FLORA_BYTES, ECOKIT_ROLE) is True
    assert should_extract_member(ROCK_NAME, DOCUMENTED_ROCK_BYTES, ECOKIT_ROLE) is True
    assert should_extract_member("unknown_kit.blend", 400 * 1024 * 1024, ECOKIT_ROLE) is False
    assert should_extract_member(FLORA_NAME, 100, ECOKIT_ROLE) is False
    assert should_extract_member("flora_mat&gn&models.blend", DOCUMENTED_FLORA_BYTES, ECOKIT_ROLE) is False
    assert required_size_ok(FLORA_NAME, LEGACY_BLEND_CAP) is False
    assert required_size_ok(FLORA_NAME, LEGACY_BLEND_CAP + 1) is True


def test_role_limit_cannot_drop_required():
    assert extract_role_limit(ECOKIT_ROLE) == 24
    small = [f"small_{i:02d}.png" for i in range(24)]
    wanted = small + [FLORA_NAME, ROCK_NAME]
    kept = apply_role_limit_keep_required(wanted, [FLORA_NAME, ROCK_NAME], 24)
    assert FLORA_NAME in kept
    assert ROCK_NAME in kept


def test_extract_tiny_required_fails_closed():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        zip_path = root / "Stylised EcoKit.zip"
        dest = root / "out"
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr(FLORA_MEMBER, b"tiny-flora")
            zf.writestr(ROCK_MEMBER, b"tiny-rock")
        try:
            extract_required_from_zip(zip_path, dest)
            raise AssertionError("tiny required libraries must fail closed")
        except RequiredLibraryError as exc:
            assert exc.code == "REQUIRED_LIBRARY_SIZE"


def test_extract_and_verify_runtime_paths():
    originals = [(spec, spec["minBytes"]) for spec in REQUIRED_LIBRARIES]
    try:
        for spec in REQUIRED_LIBRARIES:
            spec["minBytes"] = 8
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            zip_path = root / "Stylised EcoKit.zip"
            dest = root / ECOKIT_ROLE
            flora = b"FLORA-REQUIRED-LIBRARY-BYTES"
            rock = b"ROCK-REQUIRED-LIBRARY-BYTES"
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_STORED) as zf:
                zf.writestr(FLORA_MEMBER, flora)
                zf.writestr(ROCK_MEMBER, rock)
            receipts = extract_required_from_zip(zip_path, dest)
            flora_path = dest / FLORA_MEMBER
            rock_path = dest / ROCK_MEMBER
            assert flora_path.is_file()
            assert rock_path.is_file()
            assert flora_path.stat().st_size == len(flora) > 0
            assert rock_path.stat().st_size == len(rock) > 0
            assert sha256_file(flora_path) == hashlib.sha256(flora).hexdigest()
            assert sha256_file(rock_path) == hashlib.sha256(rock).hexdigest()
            by_name = {row["name"]: row for row in receipts}
            assert by_name[FLORA_NAME]["destination"] == str(flora_path)
            assert by_name[ROCK_NAME]["destination"] == str(rock_path)
            assert all(row["status"] == "OK" for row in receipts)
            extract_root = root
            assert expected_runtime_path(extract_root, FLORA_NAME) == flora_path
            assert expected_runtime_path(extract_root, ROCK_NAME) == rock_path
            verify_required_libraries(extract_root)
    finally:
        for spec, value in originals:
            spec["minBytes"] = value


def test_missing_truncated_wrong_case_wrong_hash_fail():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        try:
            verify_required_libraries(root)
            raise AssertionError("missing root must fail")
        except RequiredLibraryError as exc:
            assert exc.code == "REQUIRED_LIBRARY_MISSING"
        (root / "flora_mat&gn&models.blend").write_bytes(b"x" * 200)
        try:
            verify_required_libraries(root)
            raise AssertionError("wrong-case must fail")
        except RequiredLibraryError:
            pass
        flora = root / FLORA_NAME
        rock = root / ROCK_NAME
        flora.write_bytes(b"")
        rock.write_bytes(b"x" * (LEGACY_BLEND_CAP + 8))
        try:
            verify_required_libraries(root)
            raise AssertionError("zero-byte flora must fail")
        except RequiredLibraryError as exc:
            assert "ZERO_BYTE" in str(exc)
        flora.write_bytes(b"x" * (LEGACY_BLEND_CAP + 8))
        receipts = verify_required_libraries(root)
        assert {row["name"] for row in receipts} == {FLORA_NAME, ROCK_NAME}
        assert all(row["status"] == "OK" for row in receipts)
        try:
            verify_required_libraries(root, expected_hashes={FLORA_NAME: "0" * 64})
            raise AssertionError("wrong hash must fail")
        except RequiredLibraryError as exc:
            assert "HASH_MISMATCH" in str(exc)


def test_original14_manifest_and_locks():
    manifest = original14_manifest()
    assert manifest["count"] == 14
    assert manifest["ok"] is True
    assert manifest["roles"][-2] == ECOKIT_ROLE
    assert manifest["ecokitZipSha256"] == ECOKIT_ZIP_SHA256
    assert {row["name"] for row in manifest["requiredLibraries"]} == {FLORA_NAME, ROCK_NAME}
    frames = hero_still_frames()
    assert frames == {
        "SHOT_01": 48,
        "SHOT_02": 210,
        "SHOT_03": 360,
        "SHOT_04": 520,
        "SHOT_05": 680,
        "SHOT_06": 860,
    }
    cameras = default_shot_cameras()
    assert [cam["camera"] for cam in cameras] == [
        "TJ_SHOT_01_CAM",
        "TJ_SHOT_02_CAM",
        "TJ_SHOT_03_CAM",
        "TJ_SHOT_04_CAM",
        "TJ_SHOT_05_CAM",
        "TJ_SHOT_06_CAM",
    ]
    shot02 = next(cam for cam in cameras if cam["id"] == "SHOT_02")
    assert shot02["start"]["location"] == CAMERA_C["location"] == (2.2, -21.4, 3.40)
    assert shot02["start"]["look"] == CAMERA_C["look"] == (-3.4, -10.2, 1.75)
    assert shot02["start"]["lens"] == CAMERA_C["lens"] == 32.0
    assert WATER_LOCK["ior"] == 1.33
    assert WATER_LOCK["transmission"] == 0.80
    assert WATER_LOCK["prismM"] == 0.18
    assert WATER_LOCK["volumeDensity"] == 0.18
    valley = (HERE / "cinematic_valley_world_v1.py").read_text()
    assert "WATER_WIDTH_SCALE = 0.30" in valley
    assert "BED_WIDTH_SCALE = 0.68" in valley
    assert "HDRI_REFLECTION_ROTATION_Z = 0.48" in valley
    assert 'bpy.context.scene.camera = v3_cam' not in valley


def main() -> int:
    test_historical_180mib_cap_is_the_v3_skip()
    test_role_limit_cannot_drop_required()
    test_extract_tiny_required_fails_closed()
    test_extract_and_verify_runtime_paths()
    test_missing_truncated_wrong_case_wrong_hash_fail()
    test_original14_manifest_and_locks()
    print("cinematic_required_extract_v1_test PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
