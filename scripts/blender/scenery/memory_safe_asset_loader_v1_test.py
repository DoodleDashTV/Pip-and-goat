#!/usr/bin/env python3
from memory_safe_asset_loader_v1 import (
    AMPLIFICATION_BLOCK,
    AMPLIFICATION_CODE,
    SCHEMA,
    amplification_report,
    image_raw_bytes,
    is_hidden_library_master,
)


def test_exact_object_append_policy_is_ok():
    row = amplification_report(
        requested_object_count=1,
        loaded_object_count=1,
        loaded_image_count=4,
        loaded_material_count=3,
        source_image_count=40,
        explicit_all_images=False,
    )
    assert row["schema"] == SCHEMA
    assert row["ok"] is True
    assert row["code"] is None
    assert row["explicitAllImages"] is False


def test_no_explicit_all_image_append():
    row = amplification_report(
        requested_object_count=8,
        loaded_object_count=8,
        loaded_image_count=8,
        source_image_count=200,
        explicit_all_images=False,
    )
    assert row["explicitAllImages"] is False
    assert "EXPLICIT_ALL_IMAGE_APPEND" not in row["warnings"]


def test_dependency_preservation_allows_referenced_images():
    # One tree with 4 referenced maps is required, not amplification.
    row = amplification_report(
        requested_object_count=1,
        loaded_object_count=1,
        loaded_image_count=4,
        loaded_material_count=2,
        explicit_all_images=False,
    )
    assert row["ok"] is True
    assert row["loadedImageCount"] == 4


def test_unreferenced_library_dump_warns():
    row = amplification_report(
        requested_object_count=1,
        loaded_object_count=1,
        loaded_image_count=40,
        source_image_count=40,
        explicit_all_images=True,
    )
    assert row["code"] == AMPLIFICATION_CODE
    assert "EXPLICIT_ALL_IMAGE_APPEND" in row["warnings"]
    assert "IMAGE_AMPLIFICATION" in row["warnings"]


def test_severe_amplification_blocks_when_budget_threatened():
    row = amplification_report(
        requested_object_count=1,
        loaded_object_count=200,
        loaded_image_count=120,
        explicit_all_images=True,
        memory_budget_threatened=True,
    )
    assert row["ok"] is False
    assert row["code"] == AMPLIFICATION_BLOCK
    assert "IMAGE_AMPLIFICATION_SEVERE" in row["blockers"]
    assert "MEMORY_BUDGET_THREATENED" in row["blockers"]


def test_image_raw_bytes():
    assert image_raw_bytes(1024, 1024, 4, False) == 1024 * 1024 * 4
    assert image_raw_bytes(1024, 1024, 4, True) == 1024 * 1024 * 4 * 4


def test_hidden_library_master_excludes_instances():
    assert is_hidden_library_master(
        hide_render=True, name="bq_Tree_Fagus-sylvatica_A_summer", is_lib_flag=True, is_visible_instance=False
    )
    assert not is_hidden_library_master(
        hide_render=False, name="TJ_V7_ReflectBeech", is_lib_flag=True, is_visible_instance=True
    )
    assert not is_hidden_library_master(
        hide_render=False, name="TJ_V7_ReflectBeech", is_lib_flag=True, is_visible_instance=False
    )


if __name__ == "__main__":
    test_exact_object_append_policy_is_ok()
    test_no_explicit_all_image_append()
    test_dependency_preservation_allows_referenced_images()
    test_unreferenced_library_dump_warns()
    test_severe_amplification_blocks_when_budget_threatened()
    test_image_raw_bytes()
    test_hidden_library_master_excludes_instances()
    print("memory_safe_asset_loader_v1_test PASS")
