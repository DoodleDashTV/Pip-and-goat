#!/usr/bin/env python3
"""Zero-cost ranking tests for the Original-14 scenery speed repair."""
from __future__ import annotations

import math
from pathlib import Path

from showcase_original14_select import (
    extract_role_limit,
    extract_sort_key,
    geometry_file_limit,
    is_box_mesh,
    is_camera_hero_name,
    is_dominating_plane,
    is_dump_name,
    is_foliage_card_name,
    is_high_lod_name,
    is_primitive_name,
    is_staging_name,
    is_water_or_ocean_name,
    is_authored_village_mesh_name,
    is_cabin_texture_name,
    mesh_keep_rank,
    village_orbit_radius,
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


def test_geometry_file_limits_allow_density_without_dump():
    assert geometry_file_limit('forest_nature') == 2
    assert geometry_file_limit('forest_ecokit') == 2
    assert geometry_file_limit('village_blender') == 8
    assert geometry_file_limit('village_fbx') == 6
    assert extract_role_limit('village_blender') == 40
    assert extract_role_limit('village_fbx') == 40


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


def test_ground_picker_skips_normal_maps():
    records = [
        {'name': 'Ground_Normal.png', 'ext': '.png', 'size': 4_000_000},
        {'name': 'Forest_Dirt_Diffuse.jpg', 'ext': '.jpg', 'size': 1_500_000},
    ]
    chosen = pick_ground_image_records(records)
    assert chosen['name'] == 'Forest_Dirt_Diffuse.jpg'


def test_ground_picker_skips_high_contrast_leaf_tiles():
    records = [
        {'name': 'Leaf_Pattern_Albedo.png', 'ext': '.png', 'size': 5_000_000},
        {'name': 'Village_Grass_Albedo.jpg', 'ext': '.jpg', 'size': 2_000_000},
    ]
    chosen = pick_ground_image_records(records)
    assert chosen['name'] == 'Village_Grass_Albedo.jpg'


def test_village_picker_prefers_authored_blend_over_tiny_fbx():
    records = [
        {'name': 'Fence_Post.fbx', 'ext': '.fbx', 'size': 80_000},
        {'name': 'Village.blend', 'ext': '.blend', 'size': 6_000_000},
        {'name': 'Cart.fbx', 'ext': '.fbx', 'size': 120_000},
    ]
    chosen = pick_geometry_records(records, 'village_blender', limit=1)
    assert chosen[0]['name'] == 'Village.blend'


def test_dominating_plane_is_rejected_for_camera_bounds():
    assert is_dominating_plane(8, (400.0, 400.0, 0.2)) is True
    assert is_dominating_plane(8, (16.0, 16.0, 0.15)) is True
    assert is_dominating_plane(4000, (3.0, 3.0, 8.0)) is False
    hero = mesh_keep_rank('Cabin_Hero', 'village_blender', 1800, (4, 3, 3))
    water = mesh_keep_rank('Ocean', 'village_blender', 8, (400, 400, 0.2))
    assert hero < water


def test_primitive_boxes_rank_behind_hero_meshes():
    assert is_primitive_name('Cube') is True
    assert is_primitive_name('Cube.001') is True
    assert is_primitive_name('Cabin_Hero') is False
    assert is_box_mesh(6, (2.0, 2.0, 2.0)) is True
    assert is_box_mesh(4000, (3.0, 3.0, 8.0)) is False
    hero = mesh_keep_rank('Cabin_Hero', 'village_blender', 1800, (4, 3, 3))
    cube = mesh_keep_rank('Cube', 'village_blender', 6, (2, 2, 2))
    assert hero < cube


def test_village_picker_prefers_cabin_a_over_interior_and_skips_none():
    records = [
        {'name': 'Book01.blend', 'ext': '.blend', 'size': 1_266_472},
        {'name': 'Cabin04B.blend', 'ext': '.blend', 'size': 1_598_369},
        {'name': 'Cabin04A.blend', 'ext': '.blend', 'size': 2_262_865},
        {'name': 'Grass01.blend', 'ext': '.blend', 'size': 1_252_184},
        {'name': 'Tree02.blend', 'ext': '.blend', 'size': 1_390_580},
        {'name': 'Cabin01A.blend', 'ext': '.blend', 'size': 1_806_509},
        {'name': 'Fence01.blend', 'ext': '.blend', 'size': 1_271_868},
        {'name': 'Chair01.blend', 'ext': '.blend', 'size': 1_261_232},
        {'name': 'Cabin02A.blend', 'ext': '.blend', 'size': 1_861_389},
    ]
    chosen = pick_geometry_records(records, 'village_blender', limit=8)
    names = [c['name'] for c in chosen]
    assert names[0] == 'Cabin04A.blend'
    assert 'Cabin01A.blend' in names
    assert 'Cabin02A.blend' in names
    assert 'Tree02.blend' in names
    assert 'Fence01.blend' in names
    assert 'Book01.blend' not in names
    assert 'Chair01.blend' not in names
    assert 'Grass01.blend' not in names


def test_village_extract_sort_keeps_large_cabin_a_first():
    keys = [
        ('Village (Blender 4.2.2)/Book01.blend', 1_266_472),
        ('Village (Blender 4.2.2)/Cabin04A.blend', 2_262_865),
        ('Village (Blender 4.2.2)/Grass01.blend', 1_252_184),
        ('Village (Blender 4.2.2)/Cabin01A.blend', 1_806_509),
    ]
    ordered = sorted(keys, key=lambda item: extract_sort_key(item[0], item[1], 'village_blender'))
    assert [Path(item[0]).name for item in ordered[:2]] == ['Cabin04A.blend', 'Cabin01A.blend']


def test_camera_stays_outside_village_cluster():
    assert is_authored_village_mesh_name('Building04_LOD0') is True
    assert is_authored_village_mesh_name('Roof04') is True
    assert is_authored_village_mesh_name('Pine_Tree_01') is False
    assert is_cabin_texture_name('Cabin01_ALB.png') is True
    assert is_cabin_texture_name('Wood_Log_Diffuse.jpg') is True
    assert is_cabin_texture_name('Village_Grass_Albedo.jpg') is False
    tight = village_orbit_radius(6.0, 5.0)
    wide = village_orbit_radius(20.0, 18.0)
    assert tight >= 16.0
    assert wide > tight
    assert wide <= 36.0
    # A 12x10 cluster must not use a radius that lands inside the AABB.
    assert tight > math.hypot(6.0, 5.0)


def test_camera_hero_rejects_lily_pad_and_water():
    assert is_camera_hero_name('Building04_LOD0') is True
    assert is_camera_hero_name('Roof04') is True
    assert is_camera_hero_name('Cabin01') is True
    assert is_foliage_card_name('LilyPad_Giant') is True
    assert is_camera_hero_name('LilyPad_Giant') is False
    assert is_water_or_ocean_name('Water_GN_Plane') is True
    assert is_camera_hero_name('Water_GN_Plane') is False
    assert is_high_lod_name('Building04_LOD2') is True
    assert is_high_lod_name('Building04_LOD0') is False


if __name__ == '__main__':
    test_dump_name_detects_combined_forest_kit()
    test_extract_skips_huge_obj_and_keeps_individual_assets()
    test_geometry_picker_prefers_small_blend_over_combined_obj()
    test_fallback_to_dump_when_it_is_the_only_geometry()
    test_extract_sort_puts_individual_blend_before_dump_obj()
    test_hdri_extract_limit_is_small()
    test_extracts_mtl_sidecar_for_obj_materials()
    test_staging_names_are_rejected()
    test_geometry_file_limits_allow_density_without_dump()
    test_geometry_picker_skips_staging_when_heroes_exist()
    test_mesh_keep_rank_prefers_hero_over_flat_platform()
    test_ground_picker_prefers_grass_over_random_huge_atlas()
    test_ground_picker_skips_normal_maps()
    test_ground_picker_skips_high_contrast_leaf_tiles()
    test_village_picker_prefers_authored_blend_over_tiny_fbx()
    test_dominating_plane_is_rejected_for_camera_bounds()
    test_primitive_boxes_rank_behind_hero_meshes()
    test_village_picker_prefers_cabin_a_over_interior_and_skips_none()
    test_village_extract_sort_keeps_large_cabin_a_first()
    test_camera_stays_outside_village_cluster()
    test_camera_hero_rejects_lily_pad_and_water()
    print('showcase_original14_select_test PASS')
