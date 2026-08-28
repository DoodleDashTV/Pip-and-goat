#!/usr/bin/env python3
"""Zero-cost ranking tests for the Original-14 scenery speed repair."""
from __future__ import annotations

from showcase_original14_select import (
    extract_role_limit,
    extract_sort_key,
    geometry_file_limit,
    is_dump_name,
    is_staging_name,
    mesh_keep_rank,
    pick_geometry_records,
    pick_ground_image_records,
    should_extract_member,
)


def test_dump_name_detects_combined_forest_kit():
    assert is_dump_name('Stylized_Forest_Nature_Kit.obj') is True
    assert is_dump_name('Pine_Tree_01.fbx') is False


def test_extract_skips_huge_obj_and_keeps_individual_assets():
    assert should_extract_member('Pine_Tree_01.fbx', 3 * 1024 * 1024, 'forest_nature') is True
    assert should_extract_member('house_a.blend', 40 * 1024 * 1024, 'village_blender') is True
    assert should_extract_member('huge_dump.obj', 90 * 1024 * 1024, 'forest_nature') is False


def test_geometry_picker_prefers_small_blend_over_combined_obj():
    records = [
        {'name': 'Stylized_Forest_Nature_Kit.obj', 'ext': '.obj', 'size': 9_000_000},
        {'name': 'Pine_Tree_01.fbx', 'ext': '.fbx', 'size': 2_000_000},
        {'name': 'Cabin_Hero.blend', 'ext': '.blend', 'size': 8_000_000},
    ]
    chosen = pick_geometry_records(records, 'forest_nature', limit=1)
    assert [c['name'] for c in chosen] == ['Pine_Tree_01.fbx']
    village = pick_geometry_records(records, 'village_blender', limit=1)
    assert village[0]['name'] == 'Cabin_Hero.blend'


def test_fallback_to_dump_when_it_is_the_only_geometry():
    records = [{'name': 'Stylized_Forest_Nature_Kit.obj', 'ext': '.obj', 'size': 9_000_000}]
    chosen = pick_geometry_records(records, 'forest_nature', limit=1)
    assert chosen[0]['name'] == 'Stylized_Forest_Nature_Kit.obj'


def test_extract_sort_puts_individual_blend_before_dump_obj():
    keys = [
        ('Stylized_Forest_Nature_Kit.obj', 9_000_000),
        ('Pine_Tree_01.fbx', 2_000_000),
        ('sky_preview.jpg', 1_500_000),
    ]
    ordered = sorted(keys, key=lambda item: extract_sort_key(item[0], item[1]))
    assert ordered[0][0] == 'Pine_Tree_01.fbx'


def test_hdri_extract_limit_is_small():
    assert extract_role_limit('sky_hdri') == 8
    assert extract_role_limit('village_textures') == 16
    assert extract_role_limit('forest_nature') == 24


def test_extracts_mtl_sidecar_for_obj_materials():
    assert should_extract_member('Pine_Tree_01.mtl', 1200, 'forest_nature') is True


def test_staging_names_are_rejected():
    assert is_staging_name('Staging_Platform_01') is True
    assert is_staging_name('UCX_HouseCollider') is True
    assert is_staging_name('Pine_Tree_01') is False


def test_geometry_file_limits_keep_forest_to_one_file():
    assert geometry_file_limit('forest_nature') == 1
    assert geometry_file_limit('forest_ecokit') == 1
    assert geometry_file_limit('village_blender') == 2


def test_geometry_picker_skips_staging_when_heroes_exist():
    records = [
        {'name': 'Staging_Platform.fbx', 'ext': '.fbx', 'size': 1_000_000},
        {'name': 'Cabin_Hero.blend', 'ext': '.blend', 'size': 8_000_000},
    ]
    chosen = pick_geometry_records(records, 'village_blender', limit=1)
    assert chosen[0]['name'] == 'Cabin_Hero.blend'


def test_mesh_keep_rank_prefers_hero_over_flat_platform():
    hero = mesh_keep_rank('Pine_Tree_01', 'forest_nature', 4000, (3, 3, 8))
    slab = mesh_keep_rank('Staging_Platform', 'forest_nature', 20000, (40, 40, 0.2))
    assert hero < slab
    mid = mesh_keep_rank('DebugPlane', 'village_blender', 800, (6, 6, 0.1))
    cabin = mesh_keep_rank('Cabin_Hero', 'village_blender', 800, (4, 3, 3))
    assert cabin < mid


def test_ground_picker_prefers_grass_over_random_huge_atlas():
    records = [
        {'name': 'Atlas_Pack.png', 'ext': '.png', 'size': 12_000_000},
        {'name': 'Village_Grass_Albedo.jpg', 'ext': '.jpg', 'size': 2_000_000},
    ]
    chosen = pick_ground_image_records(records)
    assert chosen['name'] == 'Village_Grass_Albedo.jpg'


if __name__ == '__main__':
    test_dump_name_detects_combined_forest_kit()
    test_extract_skips_huge_obj_and_keeps_individual_assets()
    test_geometry_picker_prefers_small_blend_over_combined_obj()
    test_fallback_to_dump_when_it_is_the_only_geometry()
    test_extract_sort_puts_individual_blend_before_dump_obj()
    test_hdri_extract_limit_is_small()
    test_extracts_mtl_sidecar_for_obj_materials()
    test_staging_names_are_rejected()
    test_geometry_file_limits_keep_forest_to_one_file()
    test_geometry_picker_skips_staging_when_heroes_exist()
    test_mesh_keep_rank_prefers_hero_over_flat_platform()
    test_ground_picker_prefers_grass_over_random_huge_atlas()
    print('showcase_original14_select_test PASS')
